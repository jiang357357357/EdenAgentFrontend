import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"

import { updateDesktopActivityFacts } from "../../../../lib/desktop-window"
import { RealtimeSTTService, type RealtimeSTTStatus } from "../../../../lib/realtime-stt"

interface RealtimeVoiceInputOptions {
  audioInputDeviceId?: string
  autoSendOnFinish?: boolean
  disabled?: boolean
  halfDuplexOutputActive: boolean
  input: string
  onSend: (text: string) => void | Promise<void>
  onStart: () => void
  overlay: boolean
  surface?: "chat-overlay" | "main-chat" | "pet-bubble"
  setInput: Dispatch<SetStateAction<string>>
  sessionId?: string
  sttConfigId?: number | null
  voiceInputEnabled: boolean
}

export function useRealtimeVoiceInput({
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
  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0)
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

  useEffect(() => () => {
    voiceGenerationRef.current += 1
    void voiceServiceRef.current?.cancel()
    voiceServiceRef.current = null
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
    setHalfDuplexWaiting(false)
    void voiceServiceRef.current?.cancel()
    voiceServiceRef.current = null
    setVoiceStatus("idle")
    setVoiceLevel(0)
    setVoiceError("")
  }, [voiceInputEnabled])

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

  const finishVoiceInput = async (keepHalfDuplex = false) => {
    const service = voiceServiceRef.current
    if (!service) return
    const generation = voiceGenerationRef.current
    if (!keepHalfDuplex) {
      halfDuplexActiveRef.current = false
      setHalfDuplexActive(false)
      setHalfDuplexPaused(false)
      setHalfDuplexWaiting(false)
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
    const service = voiceServiceRef.current
    voiceServiceRef.current = null
    voiceStartedAtRef.current = null
    setVoiceElapsedSeconds(0)
    setVoiceStatus("idle")
    setVoiceLevel(0)
    setInput(voiceOriginalInputRef.current)
    setVoiceError("")
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
    if (!sessionId) {
      setVoiceError("当前会话尚未就绪，无法启动语音识别")
      return
    }
    if (typeof sttConfigId !== "number") {
      setVoiceError("当前角色尚未关联语音识别服务")
      halfDuplexActiveRef.current = false
      setHalfDuplexActive(false)
      setHalfDuplexPaused(false)
      return
    }
    setVoiceError("")
    onStart()
    voiceOriginalInputRef.current = input
    const prefix = input.trim() ? `${input.trim()} ` : ""
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
          setInput(`${prefix}${text}`)
        }
      },
      onAutoFinish: ({ text, autoSend }) => {
        if (voiceGenerationRef.current !== generation || voiceServiceRef.current !== service) return
        if (voiceServiceRef.current === service) voiceServiceRef.current = null
        voiceStartedAtRef.current = null
        const completedText = `${prefix}${text}`.trim()
        setInput(completedText)
        if ((autoSendOnFinish || autoSend || halfDuplexActiveRef.current) && completedText) {
          halfDuplexResponseObservedRef.current = false
          setHalfDuplexWaiting(true)
          setInput("")
          void Promise.resolve(onSend(completedText)).catch((error) => {
            setHalfDuplexWaiting(false)
            setVoiceError(error instanceof Error ? error.message : "语音消息发送失败")
            setInput(completedText)
          })
        }
      },
      onError: (error) => {
        if (voiceGenerationRef.current !== generation || voiceServiceRef.current !== service) return
        halfDuplexActiveRef.current = false
        setHalfDuplexActive(false)
        setHalfDuplexPaused(false)
        setHalfDuplexWaiting(false)
        setVoiceError(error.message)
      },
    })
    voiceServiceRef.current = service
    try {
      await service.start({ sessionId, configId: sttConfigId, audioInputDeviceId })
    } catch {
      if (voiceGenerationRef.current === generation && voiceServiceRef.current === service) {
        voiceStartedAtRef.current = null
        voiceServiceRef.current = null
      }
    }
  }

  const resumeVoiceSession = async () => {
    setHalfDuplexPaused(false)
    if (!halfDuplexOutputActive && !disabled && voiceStatus === "idle" && !voiceServiceRef.current) {
      await startVoiceInput()
    }
  }

  const toggleVoiceInput = async () => {
    if (!voiceInputEnabled || disabled || voiceStatus === "connecting" || voiceStatus === "transcribing") return
    if (voiceStatus === "recording") {
      await finishVoiceInput()
      return
    }
    halfDuplexActiveRef.current = true
    setHalfDuplexActive(true)
    setHalfDuplexPaused(false)
    await startVoiceInput()
  }

  useEffect(() => {
    if (!halfDuplexActive || halfDuplexPaused) return
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
    if (halfDuplexWaiting) {
      if (!halfDuplexResponseObservedRef.current) return
      setHalfDuplexWaiting(false)
      halfDuplexResponseObservedRef.current = false
      return
    }
    if (voiceStatus === "idle" && !voiceServiceRef.current) void startVoiceInput()
  }, [disabled, halfDuplexActive, halfDuplexOutputActive, halfDuplexPaused, halfDuplexWaiting, sessionId, sttConfigId, voiceStatus])

  const voiceElapsedLabel = `${String(Math.floor(voiceElapsedSeconds / 60)).padStart(2, "0")}:${String(voiceElapsedSeconds % 60).padStart(2, "0")}`

  return {
    cancelVoiceInput,
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
  }
}
