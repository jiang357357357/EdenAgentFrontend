import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"

import { updateDesktopActivityFacts } from "../../../../lib/desktop-window"
import { RealtimeSTTService, type RealtimeSTTStatus } from "../../../../lib/realtime-stt"
import { createDesktopVoiceCall, type CallAudioSettings, type DesktopVoiceCallState, type DesktopVoiceDestination, type DesktopVoiceTurn } from "../../../../lib/agent-voice-call"
import type { VoiceCallGreeting } from "../voice-call-captions"

export type VoiceCallPhase = "dialing" | "unanswered" | "opening" | "connected" | null

interface RealtimeVoiceInputOptions {
  onCallStateChange?: ((call: DesktopVoiceCallState | null) => void) | undefined
  prepareDraftCall?: (() => Promise<DesktopVoiceDestination>) | undefined
  callAudioSettings?: CallAudioSettings | undefined
  audioInputDeviceId?: string
  autoSendOnFinish?: boolean
  disabled?: boolean
  halfDuplexOutputActive: boolean
  input: string
  onSend: (text: string, voice?: DesktopVoiceTurn) => void | Promise<void>
  onStart: () => void
  overlay: boolean
  surface?: "chat-overlay" | "main-chat" | "pet-bubble"
  setInput: Dispatch<SetStateAction<string>>
  sessionId?: string
  sttConfigId?: number | null
  voiceInputEnabled: boolean
}

export function useRealtimeVoiceInput({
  onCallStateChange,
  prepareDraftCall,
  callAudioSettings,
  audioInputDeviceId,
  autoSendOnFinish = false,
  disabled,
  halfDuplexOutputActive,
  input,
  onSend,
  onStart,
  overlay,
  surface,
  setInput,
  sessionId,
  sttConfigId,
  voiceInputEnabled,
}: RealtimeVoiceInputOptions) {
  const activitySurface = surface ?? (overlay ? "chat-overlay" : "main-chat")
  const [voiceStatus, setVoiceStatus] = useState<RealtimeSTTStatus>("idle")
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [voiceError, setVoiceError] = useState("")
  const [voiceTranscript, setVoiceTranscript] = useState("")
  const [callGreeting, setCallGreeting] = useState<VoiceCallGreeting | null>(null)
  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0)
  const [callPhase, setCallPhase] = useState<VoiceCallPhase>(null)
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null)
  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0)
  const [halfDuplexActive, setHalfDuplexActive] = useState(false)
  const [halfDuplexPaused, setHalfDuplexPaused] = useState(false)
  const [halfDuplexWaiting, setHalfDuplexWaiting] = useState(false)
  const voicePrefixRef = useRef("")
  const voiceOriginalInputRef = useRef("")
  const voiceStartedAtRef = useRef<number | null>(null)
  const voiceServiceRef = useRef<RealtimeSTTService | null>(null)
  const voiceGenerationRef = useRef(0)
  const halfDuplexActiveRef = useRef(false)
  const halfDuplexResponseObservedRef = useRef(false)
  const callRef = useRef<(ReturnType<typeof createDesktopVoiceCall> & { configId: number }) | null>(null)
  const dialAttemptRef = useRef<symbol | null>(null)

  const releaseCall = () => {
    const call = callRef.current
    const dialing = dialAttemptRef.current !== null
    callRef.current = null
    dialAttemptRef.current = null
    if (!call && !dialing) return
    setCallPhase(null)
    setCallStartedAt(null)
    setCallGreeting(null)
    void call?.end().catch(() => {}) // A disconnected call expires in Agent.
    if (call) onCallStateChange?.(null)
  }

  useEffect(() => () => {
    voiceGenerationRef.current += 1
    void voiceServiceRef.current?.cancel()
    voiceServiceRef.current = null
    releaseCall()
    void updateDesktopActivityFacts({
      surface: activitySurface,
      chat_input_focused: false,
      voice_recording: false,
    })
  }, [])

  useEffect(() => {
    void updateDesktopActivityFacts({
      surface: activitySurface,
      voice_recording: voiceStatus === "recording",
      ...(voiceStatus === "recording" ? { last_user_interaction_at: new Date().toISOString() } : {}),
    })
  }, [overlay, voiceStatus])

  useEffect(() => {
    if (voiceInputEnabled) return
    voiceGenerationRef.current += 1
    halfDuplexActiveRef.current = false
    setHalfDuplexActive(false)
    setHalfDuplexPaused(false)
    setHalfDuplexWaiting(false)
    releaseCall()
    void voiceServiceRef.current?.cancel()
    voiceServiceRef.current = null
    setVoiceStatus("idle")
    setVoiceLevel(0)
    setVoiceError("")
    setVoiceTranscript("")
  }, [voiceInputEnabled])

  useEffect(() => {
    if (!callRef.current || callRef.current.sessionId === sessionId) return
    voiceGenerationRef.current += 1
    halfDuplexActiveRef.current = false
    setHalfDuplexActive(false)
    setHalfDuplexPaused(false)
    setHalfDuplexWaiting(false)
    releaseCall()
    void voiceServiceRef.current?.cancel()
    voiceServiceRef.current = null
    voiceStartedAtRef.current = null
    setVoiceStatus("idle")
    setVoiceLevel(0)
    setVoiceError("")
    setVoiceTranscript("")
  }, [sessionId])

  useEffect(() => {
    if (voiceStatus !== "recording" || voiceStartedAtRef.current === null) return
    const updateElapsed = () => {
      const startedAt = voiceStartedAtRef.current
      if (startedAt !== null) {
        setVoiceElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)))
      }
    }
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 250)
    return () => window.clearInterval(timer)
  }, [voiceStatus])

  useEffect(() => {
    if (callStartedAt === null) return
    const timer = window.setInterval(() => setCallElapsedSeconds(Math.floor((performance.now() - callStartedAt) / 1000)), 250)
    return () => window.clearInterval(timer)
  }, [callStartedAt])

  const finishVoiceInput = async (keepHalfDuplex = false) => {
    const service = voiceServiceRef.current
    if (!service) return
    const generation = voiceGenerationRef.current
    if (!keepHalfDuplex) {
      halfDuplexActiveRef.current = false
      setHalfDuplexActive(false)
      setHalfDuplexPaused(false)
      setHalfDuplexWaiting(false)
      releaseCall()
    }
    try {
      const finalText = await service.finish()
      if (voiceGenerationRef.current === generation && voiceServiceRef.current === service) {
        setInput(`${voicePrefixRef.current}${finalText}`.trim())
      }
    } catch (error) {
      if (voiceGenerationRef.current === generation && voiceServiceRef.current === service) {
        setVoiceError(error instanceof Error ? error.message : "语音转写失败")
      }
    } finally {
      if (voiceGenerationRef.current === generation && voiceServiceRef.current === service) {
        voiceStartedAtRef.current = null
        voiceServiceRef.current = null
      }
    }
  }

  const cancelVoiceInput = async () => {
    voiceGenerationRef.current += 1
    halfDuplexActiveRef.current = false
    setHalfDuplexActive(false)
    setHalfDuplexPaused(false)
    setHalfDuplexWaiting(false)
    releaseCall()
    const service = voiceServiceRef.current
    voiceServiceRef.current = null
    voiceStartedAtRef.current = null
    setVoiceElapsedSeconds(0)
    setVoiceStatus("idle")
    setVoiceLevel(0)
    if (!onCallStateChange) setInput(voiceOriginalInputRef.current)
    setCallPhase(null)
    setVoiceError("")
    setVoiceTranscript("")
    await service?.cancel()
  }

  const pauseVoiceSession = async () => {
    voiceGenerationRef.current += 1
    setHalfDuplexPaused(true)
    const service = voiceServiceRef.current
    voiceServiceRef.current = null
    voiceStartedAtRef.current = null
    setVoiceElapsedSeconds(0)
    setVoiceStatus("idle")
    setVoiceLevel(0)
    await service?.cancel()
  }

  const startVoiceInput = async () => {
    if (
      !voiceInputEnabled
      || disabled
      || halfDuplexOutputActive
      || voiceStatus !== "idle"
      || voiceServiceRef.current
    ) return
    const call = callRef.current
    const recordingSessionId = call?.sessionId ?? sessionId
    const recordingConfigId = call?.configId ?? sttConfigId
    if (!recordingSessionId) {
      setVoiceError("当前会话尚未就绪，无法启动语音识别")
      return
    }
    if (typeof recordingConfigId !== "number") {
      setVoiceError("当前角色尚未关联语音识别服务")
      halfDuplexActiveRef.current = false
      setHalfDuplexActive(false)
      setHalfDuplexPaused(false)
      return
    }
    setVoiceError("")
    setVoiceTranscript("")
    onStart()
    if (!call) voiceOriginalInputRef.current = input
    const prefix = !call && input.trim() ? `${input.trim()} ` : ""
    voicePrefixRef.current = prefix
    const generation = voiceGenerationRef.current + 1
    voiceGenerationRef.current = generation
    voiceStartedAtRef.current = Date.now()
    setVoiceElapsedSeconds(0)
    const service = new RealtimeSTTService({
      onStatus: (status) => {
        if (voiceGenerationRef.current === generation) setVoiceStatus(status)
      },
      onLevel: (level) => {
        if (voiceGenerationRef.current === generation) setVoiceLevel(level)
      },
      onTranscript: ({ text }) => {
        if (voiceGenerationRef.current === generation && voiceServiceRef.current === service) {
          if (call) setVoiceTranscript(text)
          else setInput(`${prefix}${text}`)
        }
      },
      onAutoFinish: ({ text, autoSend }) => {
        if (voiceGenerationRef.current !== generation || voiceServiceRef.current !== service) return
        if (voiceServiceRef.current === service) voiceServiceRef.current = null
        voiceStartedAtRef.current = null
        const completedText = `${prefix}${text}`.trim()
        if (call) setVoiceTranscript(completedText)
        else setInput(completedText)
        if ((autoSendOnFinish || autoSend || halfDuplexActiveRef.current) && completedText) {
          halfDuplexResponseObservedRef.current = false
          setHalfDuplexWaiting(true)
          if (!call) setInput("")
          const voice = call?.utterance()
          void Promise.resolve(onSend(completedText, voice)).catch((error) => {
            if (call ? callRef.current !== call : voiceGenerationRef.current !== generation) return
            setHalfDuplexWaiting(false)
            setVoiceError(error instanceof Error ? error.message : "语音消息发送失败")
            if (!call) setInput(completedText)
            halfDuplexActiveRef.current = false
            setHalfDuplexActive(false)
            releaseCall()
          })
        }
      },
      onError: (error) => {
        if (voiceGenerationRef.current !== generation || voiceServiceRef.current !== service) return
        halfDuplexActiveRef.current = false
        setHalfDuplexActive(false)
        setHalfDuplexPaused(false)
        setHalfDuplexWaiting(false)
        releaseCall()
        setVoiceError(error.message)
      },
    })
    voiceServiceRef.current = service
    try {
      await service.start({ sessionId: recordingSessionId, configId: recordingConfigId, audioInputDeviceId })
    } catch {
      if (voiceGenerationRef.current === generation && voiceServiceRef.current === service) {
        voiceStartedAtRef.current = null
        voiceServiceRef.current = null
      }
    }
  }

  const resumeVoiceSession = async () => {
    setHalfDuplexPaused(false)
    if (!callRef.current && !halfDuplexOutputActive && !disabled && voiceStatus === "idle" && !voiceServiceRef.current) {
      await startVoiceInput()
    }
  }

  const toggleVoiceInput = async () => {
    if (!voiceInputEnabled || disabled || voiceStatus === "connecting" || voiceStatus === "transcribing") return
    if (dialAttemptRef.current || callRef.current && !halfDuplexActiveRef.current) return
    if (voiceStatus === "recording") {
      await finishVoiceInput()
      return
    }
    if (onCallStateChange && !callRef.current) {
      if (halfDuplexOutputActive) return
      const attempt = Symbol()
      dialAttemptRef.current = attempt
      let answered = false
      setVoiceError("")
      setVoiceTranscript("")
      setCallPhase("dialing")
      setVoiceStatus("connecting")
      try {
        const destination = sessionId ? { sessionId, configId: sttConfigId } : await prepareDraftCall?.()
        if (dialAttemptRef.current !== attempt) return
        if (!destination) throw new Error('请先打开一个会话')
        if (typeof destination.configId !== 'number') throw new Error('当前角色尚未配置语音识别')
        const call = { ...createDesktopVoiceCall(destination.sessionId), configId: destination.configId }
        callRef.current = call
        onCallStateChange({ sessionId: call.sessionId, phase: "dialing" })
        await call.open()
        if (callRef.current !== call) { void call.end().catch(() => {}); return }
        const greeting = await call.waitForAnswer()
        if (callRef.current !== call) return
        answered = true
        setCallElapsedSeconds(0)
        setCallStartedAt(performance.now())
        setCallPhase("opening")
        setCallGreeting({ messageId: greeting.messageId, text: greeting.text, receivedAt: Date.now() })
        onCallStateChange({ sessionId: call.sessionId, phase: "opening", greetingMessageId: greeting.messageId })
        await call.playGreeting(greeting, callAudioSettings)
        if (callRef.current !== call) return
        onCallStateChange({ sessionId: call.sessionId, phase: "connected", greetingMessageId: greeting.messageId })
        setCallPhase("connected")
        setVoiceStatus("idle")
        halfDuplexActiveRef.current = true
        setHalfDuplexActive(true)
        setHalfDuplexPaused(false)
      } catch (error) {
        if (dialAttemptRef.current === attempt) {
          setVoiceError(error instanceof Error ? error.message : "暂时无法开启语音通话")
          releaseCall()
          if (!answered) setCallPhase("unanswered")
          setVoiceStatus("idle")
        }
      } finally {
        if (dialAttemptRef.current === attempt) dialAttemptRef.current = null
      }
      return
    }
    halfDuplexActiveRef.current = true
    setHalfDuplexActive(true)
    setHalfDuplexPaused(false)
    await startVoiceInput()
  }

  useEffect(() => {
    if (!halfDuplexActive) return
    if (halfDuplexOutputActive || disabled) {
      halfDuplexResponseObservedRef.current = true
      const service = voiceServiceRef.current
      if (service) {
        voiceServiceRef.current = null
        voiceStartedAtRef.current = null
        void service.cancel()
      }
      return
    }
    if (halfDuplexPaused) return
    if (halfDuplexWaiting) {
      if (!halfDuplexResponseObservedRef.current) return
      setHalfDuplexWaiting(false)
      halfDuplexResponseObservedRef.current = false
      return
    }
    if (voiceStatus === "idle" && !voiceServiceRef.current) void startVoiceInput()
  }, [disabled, halfDuplexActive, halfDuplexOutputActive, halfDuplexPaused, halfDuplexWaiting, sessionId, sttConfigId, voiceStatus])

  const elapsed = callStartedAt === null ? voiceElapsedSeconds : callElapsedSeconds
  const voiceElapsedLabel = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`

  return {
    cancelVoiceInput,
    callGreeting,
    callPhase,
    halfDuplexActive,
    halfDuplexPaused,
    halfDuplexWaiting,
    pauseVoiceSession,
    resumeVoiceSession,
    toggleVoiceInput,
    voiceBusy: voiceStatus !== "idle",
    voiceElapsedLabel,
    voiceError,
    voiceLevel,
    voiceStatus,
    voiceTranscript,
  }
}
