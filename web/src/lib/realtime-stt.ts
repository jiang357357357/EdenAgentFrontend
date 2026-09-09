import { TARGET_SAMPLE_RATE, clamp, downsampleToPcm16, estimateLevel } from './realtime-stt-audio'
import { startRealtimeSpeech } from './realtime-stt-handshake'
import { createRealtimeSttSocket } from "./rpc-transport"
import { realtimeSTTFinalization } from "./realtime-stt-finalization"
import { getRuntimeOriginRevision, RUNTIME_ORIGIN_STORAGE_KEY } from './runtime-origin'

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
  sessionId: string
  configId?: number
  endSilenceMs?: number
  audioInputDeviceId?: string
}

export class RealtimeSTTService {
  private generation = 0
  private releaseWorldListener?: () => void
  private acceptingResults = false
  private audioContext?: AudioContext
  private finishPending?: { resolve: (text: string) => void; timer: number }
  private finishTask?: Promise<string>
  private stopSent = false
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

  async start(options: RealtimeSTTStartOptions) {
    if (this.status !== "idle") return
    this.finishTask = undefined
    this.stopSent = false
    const generation = ++this.generation
    const revision = getRuntimeOriginRevision()
    const worldChanged = () => { if (getRuntimeOriginRevision() !== revision) void this.cancel() }
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === RUNTIME_ORIGIN_STORAGE_KEY) worldChanged() }
    window.addEventListener('edenagent:runtime-origin-changed', worldChanged)
    window.addEventListener('storage', storage)
    this.releaseWorldListener = () => {
      window.removeEventListener('edenagent:runtime-origin-changed', worldChanged)
      window.removeEventListener('storage', storage)
    }
    this.acceptingResults = true
    this.latestTranscript = ""
    this.setStatus("connecting")

    try {
      const socket = await createRealtimeSttSocket(options.sessionId)
      if (generation !== this.generation || revision !== getRuntimeOriginRevision()) { socket.close(); throw new Error('语音输入已取消') }
      this.socket = socket
      socket.addEventListener("message", (event) => { if (this.socket === socket && generation === this.generation) this.handleSocketMessage(event.data) })
      socket.addEventListener("close", () => {
        if (this.socket !== socket || generation !== this.generation) return
        this.settleFinish()
        if (this.status !== "idle" && this.acceptingResults) {
          this.handlers.onError?.(new Error("实时语音连接已关闭"))
          void this.close(false)
        }
      })

      const behavior = await startRealtimeSpeech(socket, options,
        () => this.socket === socket && generation === this.generation && this.acceptingResults)
      this.applyInputBehavior(behavior)

      if (generation !== this.generation || !this.acceptingResults) throw new Error('语音输入已取消')
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("当前环境不支持麦克风采集")
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          ...(options.audioInputDeviceId && options.audioInputDeviceId !== "default"
            ? { deviceId: { exact: options.audioInputDeviceId } }
            : {}),
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: TARGET_SAMPLE_RATE,
        },
      })
      if (generation !== this.generation || !this.acceptingResults || this.socket !== socket || socket.readyState !== WebSocket.OPEN) {
        stream.getTracks().forEach((track) => track.stop())
        throw new Error("语音输入已取消")
      }

      this.mediaStream = stream
      const audioContext = new AudioContext()
      this.audioContext = audioContext
      await audioContext.resume()
      if (generation !== this.generation || this.socket !== socket || !this.acceptingResults) throw new Error('语音输入已取消')
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      const gain = audioContext.createGain()
      gain.gain.value = 0
      processor.onaudioprocess = (event) => {
        if (generation !== this.generation || this.socket !== socket || this.status !== "recording" || socket.readyState !== WebSocket.OPEN) return
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
      if (generation !== this.generation) throw error
      await this.close(false)
      const normalized = error instanceof Error ? error : new Error(String(error))
      this.handlers.onError?.(normalized)
      throw normalized
    }
  }

  finish(timeoutMs = 30_000): Promise<string> {
    if (this.finishTask) return this.finishTask
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000) return Promise.reject(new Error('Invalid speech finalization timeout'))
    const task = this.finishRecording(timeoutMs, this.generation)
    this.finishTask = task
    void task.finally(() => { if (this.finishTask === task) this.finishTask = undefined }).catch(() => {})
    return task
  }

  private async finishRecording(timeoutMs: number, generation: number) {
    if (this.status === "idle") return this.latestTranscript
    this.stopAudioCapture()
    this.setStatus("transcribing")
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      const text = this.latestTranscript
      await this.close(false)
      return text
    }

    try {
      const text = await new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(() => this.settleFinish(), timeoutMs)
        this.finishPending = { resolve, timer }
        try { this.sendStop(socket) }
        catch (error) {
          window.clearTimeout(timer)
          this.finishPending = undefined
          reject(error)
        }
      })
      // Cancellation or socket failure already closed this recording. Never close its successor.
      if (generation === this.generation) await this.close(false)
      return text
    } catch (error) {
      if (generation === this.generation) await this.close(false)
      throw error
    }
  }

  async cancel() {
    this.acceptingResults = false
    this.latestTranscript = ''
    this.settleFinish("")
    await this.close(true)
  }

  private handleSocketMessage(rawData: unknown) {
    if (!this.acceptingResults || typeof rawData !== "string") return
    if (rawData.length > 1048576) {
      this.handlers.onError?.(new Error('实时语音响应过大'))
      this.settleFinish('')
      void this.close(false)
      return
    }
    let payload: Record<string, unknown>
    try {
      const decoded: unknown = JSON.parse(rawData)
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return
      payload = decoded as Record<string, unknown>
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
    const generation = this.generation, revision = getRuntimeOriginRevision()
    this.autoFinishTimer = window.setTimeout(async () => {
      this.autoFinishTimer = undefined
      if (this.status !== "recording") return
      try {
        const text = await this.finish()
        if (getRuntimeOriginRevision() !== revision || this.generation !== generation + 1) return
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
    this.generation++
    this.releaseWorldListener?.()
    this.releaseWorldListener = undefined
    this.clearAutoFinishTimer()
    this.stopAudioCapture()
    const socket = this.socket
    this.socket = undefined
    try {
      if (sendStop && socket?.readyState === WebSocket.OPEN) this.sendStop(socket)
    } finally {
      socket?.close()
      this.acceptingResults = false
      this.setStatus("idle")
    }
  }

  private sendStop(socket: WebSocket) {
    if (this.stopSent) return
    socket.send(JSON.stringify({ command: 'stop' }))
    this.stopSent = true
  }
}
