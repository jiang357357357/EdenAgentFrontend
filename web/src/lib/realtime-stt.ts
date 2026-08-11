import { getStoredToken, resolveCoreBaseUrl } from "./auth"
import { realtimeSTTFinalization } from "./realtime-stt-finalization"

export type RealtimeSTTStatus = "idle" | "connecting" | "recording" | "transcribing"

export interface RealtimeSTTTranscript {
  text: string
  isFinal: boolean
  sentenceEnd: boolean
}

interface RealtimeSTTHandlers {
  onAutoFinish?: (result: { text: string; autoSend: boolean }) => void
  onError?: (error: Error) => void
  onLevel?: (level: number) => void
  onStatus?: (status: RealtimeSTTStatus) => void
  onTranscript?: (transcript: RealtimeSTTTranscript) => void
}

interface RealtimeSTTStartOptions {
  configId?: number
  endSilenceMs?: number
}

const TARGET_SAMPLE_RATE = 16_000

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function floatToPcm16(input: Float32Array) {
  const buffer = new ArrayBuffer(input.length * 2)
  const view = new DataView(buffer)
  for (let index = 0; index < input.length; index += 1) {
    const sample = clamp(input[index], -1, 1)
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return buffer
}

function downsampleToPcm16(input: Float32Array, inputSampleRate: number) {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return floatToPcm16(input)

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE
  const outputLength = Math.max(1, Math.floor(input.length / ratio))
  const output = new Float32Array(outputLength)
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio)
    const end = Math.min(input.length, Math.floor((outputIndex + 1) * ratio))
    let sum = 0
    let count = 0
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += input[inputIndex]
      count += 1
    }
    output[outputIndex] = count > 0 ? sum / count : input[start] ?? 0
  }
  return floatToPcm16(output)
}

function estimateLevel(input: Float32Array) {
  if (input.length === 0) return 0
  let sum = 0
  for (let index = 0; index < input.length; index += 1) {
    sum += input[index] * input[index]
  }
  return clamp(Math.sqrt(sum / input.length) * 6, 0, 1)
}

async function resolveRealtimeUrl() {
  const token = getStoredToken()
  if (!token) throw new Error("用户未登录，无法使用语音输入")

  const baseUrl = new URL(`${await resolveCoreBaseUrl()}/`)
  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:"
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, "")}/ws/stt/realtime/`
  baseUrl.search = ""
  baseUrl.searchParams.set("token", token)
  return baseUrl.toString()
}

export class RealtimeSTTService {
  private acceptingResults = false
  private audioContext?: AudioContext
  private finishPending?: { resolve: (text: string) => void; timer: number }
  private gain?: GainNode
  private handlers: RealtimeSTTHandlers
  private latestTranscript = ""
  private mediaStream?: MediaStream
  private processor?: ScriptProcessorNode
  private socket?: WebSocket
  private source?: MediaStreamAudioSourceNode
  private status: RealtimeSTTStatus = "idle"
  private autoFinishTimer?: number
  private inputBehavior = { sessionEndSilenceMs: 3_000, autoFinish: true, autoSend: false }

  constructor(handlers: RealtimeSTTHandlers = {}) {
    this.handlers = handlers
  }

  get currentStatus() {
    return this.status
  }

  async start(options: RealtimeSTTStartOptions = {}) {
    if (this.status !== "idle") return
    this.acceptingResults = true
    this.latestTranscript = ""
    this.setStatus("connecting")

    try {
      const socket = new WebSocket(await resolveRealtimeUrl())
      this.socket = socket
      socket.addEventListener("message", (event) => this.handleSocketMessage(event.data))
      socket.addEventListener("close", () => {
        this.settleFinish()
        if (this.status !== "idle" && this.acceptingResults) {
          this.handlers.onError?.(new Error("实时语音连接已关闭"))
          void this.close(false)
        }
      })

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const timer = window.setTimeout(() => fail(new Error("连接语音识别服务超时")), 8_000)
        const fail = (error: Error) => {
          if (settled) return
          settled = true
          window.clearTimeout(timer)
          reject(error)
        }

        socket.addEventListener("open", () => {
          socket.send(JSON.stringify({
            command: "start",
            ...(typeof options.configId === "number" ? { config_id: options.configId } : {}),
            ...(typeof options.endSilenceMs === "number" ? { end_silence_ms: options.endSilenceMs } : {}),
          }))
        }, { once: true })
        socket.addEventListener("message", (event) => {
          if (settled || typeof event.data !== "string") return
          try {
            const payload = JSON.parse(event.data) as Record<string, unknown>
            if (payload.type === "status" && payload.status === "started") {
              this.applyInputBehavior(payload.input_behavior)
              settled = true
              window.clearTimeout(timer)
              resolve()
            } else if (payload.type === "error") {
              fail(new Error(typeof payload.message === "string" ? payload.message : "语音识别启动失败"))
            }
          } catch {
            // Ignore non-JSON upstream messages while waiting for the start acknowledgement.
          }
        })
        socket.addEventListener("error", () => fail(new Error("无法连接语音识别服务")), { once: true })
        socket.addEventListener("close", () => fail(new Error("语音识别连接已关闭")), { once: true })
      })

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("当前环境不支持麦克风采集")
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: TARGET_SAMPLE_RATE,
        },
      })
      if (!this.acceptingResults || this.socket !== socket || socket.readyState !== WebSocket.OPEN) {
        stream.getTracks().forEach((track) => track.stop())
        throw new Error("语音输入已取消")
      }

      const audioContext = new AudioContext()
      await audioContext.resume()
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      const gain = audioContext.createGain()
      gain.gain.value = 0
      processor.onaudioprocess = (event) => {
        if (this.status !== "recording" || this.socket?.readyState !== WebSocket.OPEN) return
        const input = event.inputBuffer.getChannelData(0)
        this.handlers.onLevel?.(estimateLevel(input))
        this.socket.send(downsampleToPcm16(input, audioContext.sampleRate))
      }
      source.connect(processor)
      processor.connect(gain)
      gain.connect(audioContext.destination)

      this.audioContext = audioContext
      this.gain = gain
      this.mediaStream = stream
      this.processor = processor
      this.source = source
      this.setStatus("recording")
    } catch (error) {
      await this.close(false)
      const normalized = error instanceof Error ? error : new Error(String(error))
      this.handlers.onError?.(normalized)
      throw normalized
    }
  }

  async finish(timeoutMs = 30_000) {
    if (this.status === "idle") return this.latestTranscript
    this.stopAudioCapture()
    this.setStatus("transcribing")
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      const text = this.latestTranscript
      await this.close(false)
      return text
    }

    const text = await new Promise<string>((resolve) => {
      const timer = window.setTimeout(() => this.settleFinish(), timeoutMs)
      this.finishPending = { resolve, timer }
      socket.send(JSON.stringify({ command: "stop" }))
    })
    await this.close(false)
    return text
  }

  async cancel() {
    this.acceptingResults = false
    this.settleFinish("")
    await this.close(true)
  }

  private handleSocketMessage(rawData: unknown) {
    if (!this.acceptingResults || typeof rawData !== "string") return
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawData) as Record<string, unknown>
    } catch {
      return
    }

    if (payload.type === "error") {
      const error = new Error(typeof payload.message === "string" ? payload.message : "实时语音识别失败")
      this.handlers.onError?.(error)
      this.settleFinish()
      void this.close(false)
      return
    }

    if (payload.type === "status" && payload.status === "started") {
      this.applyInputBehavior(payload.input_behavior)
      return
    }

    if (payload.type === "result") {
      const accumulated = typeof payload.accumulated === "string" ? payload.accumulated : ""
      const text = (accumulated || (typeof payload.text === "string" ? payload.text : "")).trim()
      if (!text) return
      this.clearAutoFinishTimer()
      this.latestTranscript = text
      const isFinal = payload.is_interim !== true
      const sentenceEnd = payload.sentence_end === true
      this.handlers.onTranscript?.({ text, isFinal, sentenceEnd })
      if (isFinal && sentenceEnd) {
        // A sentence result is still a preview of the recording as a whole.
        // After `stop`, GSV may emit one last sentence before its authoritative
        // commit_hint/status.final_text. Do not close the socket on that
        // intermediate result or the final overwrite can be lost.
        if (!this.finishPending) this.scheduleAutoFinish()
      }
      return
    }

    const finalization = realtimeSTTFinalization(payload, this.latestTranscript)
    if (finalization.authoritative) {
      this.latestTranscript = finalization.text
      this.handlers.onTranscript?.({ text: finalization.text, isFinal: true, sentenceEnd: true })
    }
    if (finalization.settle) this.settleFinish(finalization.text)
  }

  private setStatus(status: RealtimeSTTStatus) {
    this.status = status
    this.handlers.onStatus?.(status)
  }

  private settleFinish(text = this.latestTranscript) {
    if (!this.finishPending) return
    window.clearTimeout(this.finishPending.timer)
    this.finishPending.resolve(text.trim())
    this.finishPending = undefined
  }

  private applyInputBehavior(raw: unknown) {
    if (!raw || typeof raw !== "object") return
    const behavior = raw as Record<string, unknown>
    const duration = Number(behavior.session_end_silence_ms)
    this.inputBehavior = {
      sessionEndSilenceMs: Number.isFinite(duration) ? clamp(duration, 1_000, 15_000) : 3_000,
      autoFinish: behavior.auto_finish !== false,
      autoSend: behavior.auto_send === true,
    }
  }

  private scheduleAutoFinish() {
    if (!this.inputBehavior.autoFinish || this.status !== "recording") return
    this.clearAutoFinishTimer()
    this.autoFinishTimer = window.setTimeout(async () => {
      this.autoFinishTimer = undefined
      if (this.status !== "recording") return
      try {
        const text = await this.finish()
        this.handlers.onAutoFinish?.({ text, autoSend: this.inputBehavior.autoSend })
      } catch (error) {
        this.handlers.onError?.(error instanceof Error ? error : new Error(String(error)))
      }
    }, this.inputBehavior.sessionEndSilenceMs)
  }

  private clearAutoFinishTimer() {
    if (this.autoFinishTimer) window.clearTimeout(this.autoFinishTimer)
    this.autoFinishTimer = undefined
  }

  private stopAudioCapture() {
    this.processor?.disconnect()
    this.processor = undefined
    this.source?.disconnect()
    this.source = undefined
    this.gain?.disconnect()
    this.gain = undefined
    this.mediaStream?.getTracks().forEach((track) => track.stop())
    this.mediaStream = undefined
    void this.audioContext?.close().catch(() => undefined)
    this.audioContext = undefined
    this.handlers.onLevel?.(0)
  }

  private async close(sendStop: boolean) {
    this.clearAutoFinishTimer()
    this.stopAudioCapture()
    const socket = this.socket
    this.socket = undefined
    if (sendStop && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ command: "stop" }))
    }
    socket?.close()
    this.acceptingResults = false
    this.setStatus("idle")
  }
}
