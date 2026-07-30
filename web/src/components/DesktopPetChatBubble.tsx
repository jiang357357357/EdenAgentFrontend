import { Activity, ArrowUp, ChevronRight, Info, LoaderCircle, Mic, Pause, Play, Sparkles, Square, Wrench } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { resolveCoreAssetUrl } from "../lib/auth"
import { RealtimeSTTService, type RealtimeSTTStatus } from "../lib/realtime-stt"
import { updateDesktopActivityFacts, type PetTTSMode } from "../lib/desktop-window"
import { speechChunksForTTS, textForTTS } from "../lib/tts-text"
import { synthesizeSpeechSegment } from "../lib/mon_agent_api"
import { splitActionLines } from "../lib/message-actions"
import { cn } from "../lib/utils"
import type { MessageData, PendingPermission, PendingQuestion, PromptAttachment, ToolCall } from "../types"

interface PetDialogSegment {
  speaker: string
  text?: string
  speechSegmentId?: string
  runtimeTrace?: string
  thinking?: string
  tool?: ToolCall
}

interface SpeechClip {
  status: "synthesizing" | "ready" | "error"
  source?: string
  sources?: string[]
  error?: string
}

interface DesktopPetChatBubbleProps {
  assistantName: string
  sessionId?: string
  sttConfigId?: number | null
  ttsConfigId?: number | null
  voiceInputEnabled: boolean
  ttsMode: PetTTSMode
  latestAssistantMessage?: MessageData
  dialogSegments: PetDialogSegment[]
  isThinking: boolean
  permissions: PendingPermission[]
  questions: PendingQuestion[]
  opacity: number
  fontScale: number
  onSend: (content: string, attachments: PromptAttachment[]) => Promise<void>
  onAbort: () => Promise<void>
  onPermissionReply: (requestID: string, reply: "once" | "always" | "reject") => Promise<void>
  onQuestionReply: (requestID: string, answers: string[][]) => Promise<void>
  onQuestionReject: (requestID: string) => Promise<void>
}

function segmentText(segment: PetDialogSegment) {
  if (segment.text) return segment.text
  if (segment.runtimeTrace) return segment.runtimeTrace
  if (segment.thinking) return segment.thinking
  if (segment.tool) return `${segment.tool.name} · ${segment.tool.status}`
  return ""
}

function toolStatus(status: ToolCall["status"]) {
  if (status === "running") return "运行中"
  if (status === "success") return "完成"
  if (status === "error") return "失败"
  return status || "等待"
}

function PetMarkdownBlock({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        p: ({ children }) => <p className="m-0 whitespace-pre-wrap leading-[1.4]">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-stone-50">{children}</strong>,
        em: ({ children }) => <em className="italic text-amber-300/85">{children}</em>,
        h1: ({ children }) => <h1 className="mb-[1.5cqh] mt-0 text-[1.18em] font-semibold text-stone-50">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-[1.25cqh] mt-0 text-[1.1em] font-semibold text-stone-50">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-[1cqh] mt-0 font-semibold text-stone-50">{children}</h3>,
        ul: ({ children }) => <ul className="my-[1cqh] list-disc space-y-[0.4cqh] pl-[5cqh]">{children}</ul>,
        ol: ({ children }) => <ol className="my-[1cqh] list-decimal space-y-[0.4cqh] pl-[5cqh]">{children}</ol>,
        li: ({ children }) => <li className="pl-[0.5cqh] leading-[1.4] marker:text-stone-500">{children}</li>,
        blockquote: ({ children }) => <blockquote className="my-[1cqh] border-l-2 border-orange-500/55 pl-[3cqh] text-stone-300">{children}</blockquote>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-orange-300 underline decoration-orange-400/45 underline-offset-2">{children}</a>,
        code: ({ children, className }) => className ? (
          <code className={className}>{children}</code>
        ) : (
          <code className="rounded-[1cqh] bg-white/8 px-[1.2cqh] py-[0.25cqh] font-mono text-[0.9em] text-orange-100">{children}</code>
        ),
        pre: ({ children }) => <pre className="my-[1.5cqh] max-w-full overflow-x-auto rounded-[2cqh] bg-black/25 p-[3cqh] font-mono text-[0.86em] leading-[1.45] text-stone-200">{children}</pre>,
        hr: () => <hr className="my-[2cqh] border-white/10" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function DesktopPetMarkdown({ content }: { content: string }) {
  const chunks = splitActionLines(content)
  return (
    <div className="grid min-w-0 gap-[1.2cqh] [overflow-wrap:anywhere]">
      {chunks.map((chunk, index) => chunk.action ? (
        <p key={`${index}-${chunk.content}`} className="m-0 whitespace-pre-wrap italic leading-[1.4] text-amber-300/85">
          {chunk.content}
        </p>
      ) : (
        <div key={`${index}-${chunk.content}`} className="min-w-0">
          <PetMarkdownBlock content={chunk.content} />
        </div>
      ))}
    </div>
  )
}

export function DesktopPetChatBubble({
  assistantName,
  sessionId,
  sttConfigId,
  ttsConfigId,
  voiceInputEnabled,
  ttsMode,
  latestAssistantMessage,
  dialogSegments,
  isThinking,
  permissions,
  questions,
  opacity,
  fontScale,
  onSend,
  onAbort,
  onPermissionReply,
  onQuestionReply,
  onQuestionReject,
}: DesktopPetChatBubbleProps) {
  const [input, setInput] = useState("")
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(() => new Set())
  const [voiceStatus, setVoiceStatus] = useState<RealtimeSTTStatus>("idle")
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [voiceError, setVoiceError] = useState("")
  const [halfDuplexActive, setHalfDuplexActive] = useState(false)
  const [halfDuplexWaiting, setHalfDuplexWaiting] = useState(false)
  const [speechOutputPending, setSpeechOutputPending] = useState(isThinking)
  const [speechClips, setSpeechClips] = useState<Record<string, SpeechClip>>({})
  const [activeSpeechSegmentId, setActiveSpeechSegmentId] = useState<string | null>(null)
  const [speechPaused, setSpeechPaused] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioSegmentIdRef = useRef<string | null>(null)
  const finishAudioRef = useRef<(() => void) | null>(null)
  const playbackGenerationRef = useRef(0)
  const speechGenerationRef = useRef(0)
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve())
  const speechRunActiveRef = useRef(isThinking)
  const synthesizedSegmentIdsRef = useRef<Set<string>>(new Set())
  const voicePrefixRef = useRef("")
  const voiceServiceRef = useRef<RealtimeSTTService | null>(null)
  const halfDuplexActiveRef = useRef(false)
  const halfDuplexResponseObservedRef = useRef(false)
  const visibleSegments = useMemo(
    () => dialogSegments.filter((segment) => Boolean(segmentText(segment))),
    [dialogSegments],
  )
  const scrollKey = visibleSegments.map((segment) => `${segmentText(segment).length}:${segment.tool?.status ?? ""}`).join("|")
  const permission = permissions[0]
  const question = questions[0]
  const attentionVisible = Boolean(permission || question)
  const fontRatio = Math.max(70, Math.min(140, fontScale)) / 100
  const voiceBusy = voiceStatus !== "idle"
  const canSend = input.trim().length > 0 && !isThinking && !voiceBusy

  const toggleSegment = (id: string) => {
    setExpandedSegments((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const stopSpeechPlayback = (cancelSynthesis = false, clearClips = false) => {
    playbackGenerationRef.current += 1
    if (cancelSynthesis) speechGenerationRef.current += 1
    audioRef.current?.pause()
    audioRef.current = null
    audioSegmentIdRef.current = null
    finishAudioRef.current?.()
    finishAudioRef.current = null
    speechQueueRef.current = Promise.resolve()
    setActiveSpeechSegmentId(null)
    setSpeechPaused(false)
    if (clearClips) setSpeechClips({})
  }

  const playSpeechAudioSource = (segmentID: string, source: string, generation: number) => {
    return new Promise<void>((resolve, reject) => {
      if (generation !== speechGenerationRef.current) {
        resolve()
        return
      }
      const audio = new Audio(source)
      let settled = false
      const finish = (error?: unknown) => {
        if (settled) return
        settled = true
        if (finishAudioRef.current === finish) finishAudioRef.current = null
        if (audioRef.current === audio) audioRef.current = null
        if (audioSegmentIdRef.current === segmentID) audioSegmentIdRef.current = null
        setSpeechPaused(false)
        if (error) reject(error)
        else resolve()
      }
      audioRef.current = audio
      audioSegmentIdRef.current = segmentID
      finishAudioRef.current = () => finish()
      audio.addEventListener("ended", () => finish(), { once: true })
      audio.addEventListener("error", () => finish(new Error(`语音段 ${segmentID} 播放失败`)), { once: true })
      void audio.play().catch((error) => finish(error))
    })
  }

  const playSpeechSources = async (
    segmentID: string,
    sources: string[],
    generation: number,
    playbackGeneration: number,
  ) => {
    if (generation !== speechGenerationRef.current || playbackGeneration !== playbackGenerationRef.current) return
    setActiveSpeechSegmentId(segmentID)
    setSpeechPaused(false)
    try {
      for (const source of sources) {
        if (generation !== speechGenerationRef.current || playbackGeneration !== playbackGenerationRef.current) return
        await playSpeechAudioSource(segmentID, source, generation)
      }
    } finally {
      setActiveSpeechSegmentId((current) => current === segmentID ? null : current)
      setSpeechPaused(false)
    }
  }

  const enqueueSpeechSegment = (segmentID: string, messageID: string, rawText: string) => {
    if (!sessionId || !messageID || typeof ttsConfigId !== "number" || ttsMode === "none") {
      console.warn("[DesktopPet][TTS] 当前角色未关联可用的 TTS 配置")
      return
    }
    const chunks = speechChunksForTTS(rawText, ttsMode)
    if (!chunks.length) return

    const generation = speechGenerationRef.current
    const playbackGeneration = playbackGenerationRef.current
    setSpeechClips((current) => ({ ...current, [segmentID]: { status: "synthesizing" } }))
    const synthesis = (async () => {
      const sources: string[] = []
      for (const [index, text] of chunks.entries()) {
        const requestSegmentID = chunks.length === 1 ? segmentID : `${segmentID}:tts:${index}`
        const result = await synthesizeSpeechSegment({
          sessionId,
          messageId: messageID,
          segmentId: requestSegmentID,
          text,
          configId: ttsConfigId,
          mode: ttsMode,
        })
        if (!result.success) throw new Error(result.error_message || `语音段 ${index + 1}/${chunks.length} 合成失败`)
        const source = result.audio_data
          ? `data:audio/wav;base64,${result.audio_data}`
          : resolveCoreAssetUrl(result.audio_url)
        if (!source) throw new Error(`语音段 ${index + 1}/${chunks.length} 未返回音频`)
        sources.push(source)
      }
      if (!sources.length) throw new Error(`语音段 ${segmentID} 未返回音频`)
      return sources
    })()
      .then((sources) => {
        if (generation === speechGenerationRef.current) {
          setSpeechClips((current) => ({
            ...current,
            [segmentID]: { status: "ready", source: sources[0], sources },
          }))
        }
        return { sources, error: null }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        if (generation === speechGenerationRef.current) {
          setSpeechClips((current) => ({ ...current, [segmentID]: { status: "error", error: message } }))
        }
        return { sources: null, error }
      })
    const previous = speechQueueRef.current.catch(() => undefined)
    speechQueueRef.current = previous
      .then(async () => {
        const outcome = await synthesis
        if (generation !== speechGenerationRef.current) return
        if (playbackGeneration !== playbackGenerationRef.current) return
        if (outcome.error) throw outcome.error
        if (!outcome.sources) throw new Error(`语音段 ${segmentID} 未返回音频`)
        await playSpeechSources(segmentID, outcome.sources, generation, playbackGeneration)
      })
      .catch((error) => {
        console.warn("[DesktopPet][TTS] 分段合成或播放失败", error)
      })
  }

  const toggleSpeechClip = (segmentID: string) => {
    const clip = speechClips[segmentID]
    const sources = clip?.sources ?? (clip?.source ? [clip.source] : [])
    if (clip?.status !== "ready" || !sources.length) return

    if (audioSegmentIdRef.current === segmentID && audioRef.current) {
      if (audioRef.current.paused) {
        setSpeechPaused(false)
        void audioRef.current.play().catch((error) => {
          console.warn("[DesktopPet][TTS] 恢复播放失败", error)
          finishAudioRef.current?.()
        })
      } else {
        audioRef.current.pause()
        setSpeechPaused(true)
      }
      return
    }

    stopSpeechPlayback(false)
    const generation = speechGenerationRef.current
    speechQueueRef.current = playSpeechSources(
      segmentID,
      sources,
      generation,
      playbackGenerationRef.current,
    ).catch((error) => {
      console.warn("[DesktopPet][TTS] 手动播放失败", error)
    })
  }

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [scrollKey])

  useEffect(() => {
    return () => {
      void voiceServiceRef.current?.cancel()
      voiceServiceRef.current = null
      stopSpeechPlayback(true)
      void updateDesktopActivityFacts({
        surface: "pet-bubble",
        chat_input_focused: false,
        voice_recording: false,
        tts_playing: false,
      })
    }
  }, [])

  useEffect(() => {
    void updateDesktopActivityFacts({
      surface: "pet-bubble",
      voice_recording: voiceStatus === "recording",
      ...(voiceStatus === "recording" ? { last_user_interaction_at: new Date().toISOString() } : {}),
    })
  }, [voiceStatus])

  useEffect(() => {
    void updateDesktopActivityFacts({
      surface: "pet-bubble",
      tts_playing: Boolean(activeSpeechSegmentId) && !speechPaused,
    })
  }, [activeSpeechSegmentId, speechPaused])

  useEffect(() => {
    if (voiceInputEnabled) return
    halfDuplexActiveRef.current = false
    setHalfDuplexActive(false)
    setHalfDuplexWaiting(false)
    void voiceServiceRef.current?.cancel()
    voiceServiceRef.current = null
    setVoiceError("")
  }, [voiceInputEnabled])

  useEffect(() => {
    if (ttsMode === "none") {
      stopSpeechPlayback(true, true)
      speechRunActiveRef.current = isThinking
      setSpeechOutputPending(isThinking)
      return
    }
    const runWasActive = speechRunActiveRef.current
    if (isThinking) {
      speechRunActiveRef.current = true
      setSpeechOutputPending(true)
    }
    const maySpeakCurrentRun = isThinking || runWasActive
    if (maySpeakCurrentRun) {
      for (const segment of latestAssistantMessage?.segments ?? []) {
        if (segment.type !== "text" || segment.state !== "done" || !segment.content.trim()) continue
        const text = textForTTS(segment.content, ttsMode)
        if (!text || synthesizedSegmentIdsRef.current.has(segment.id)) continue
        synthesizedSegmentIdsRef.current.add(segment.id)
        enqueueSpeechSegment(segment.id, latestAssistantMessage.id, segment.content)
      }
    }
    if (!isThinking && runWasActive) {
      speechRunActiveRef.current = false
      const generation = speechGenerationRef.current
      void speechQueueRef.current.finally(() => {
        if (generation === speechGenerationRef.current) setSpeechOutputPending(false)
      })
    } else if (!isThinking && !runWasActive) {
      setSpeechOutputPending(false)
    }
  }, [isThinking, latestAssistantMessage, sessionId, ttsConfigId, ttsMode])

  const send = async () => {
    const content = input.trim()
    if (!content || isThinking || voiceBusy) return
    setInput("")
    void updateDesktopActivityFacts({
      surface: "pet-bubble",
      last_user_interaction_at: new Date().toISOString(),
    })
    await onSend(content, [])
  }

  const startVoiceInput = async () => {
    if (
      !voiceInputEnabled
      || isThinking
      || speechOutputPending
      || voiceStatus !== "idle"
      || voiceServiceRef.current
    ) return
    if (typeof sttConfigId !== "number") {
      setVoiceError("当前角色尚未关联语音识别服务")
      halfDuplexActiveRef.current = false
      setHalfDuplexActive(false)
      return
    }

    setVoiceError("")
    stopSpeechPlayback()
    voicePrefixRef.current = input.trim() ? `${input.trim()} ` : ""
    const service = new RealtimeSTTService({
      onStatus: setVoiceStatus,
      onLevel: setVoiceLevel,
      onTranscript: ({ text }) => setInput(`${voicePrefixRef.current}${text}`),
      onAutoFinish: ({ text, autoSend }) => {
        if (voiceServiceRef.current === service) voiceServiceRef.current = null
        const completedText = `${voicePrefixRef.current}${text}`.trim()
        setInput(completedText)
        if ((autoSend || halfDuplexActiveRef.current) && completedText) {
          halfDuplexResponseObservedRef.current = false
          setHalfDuplexWaiting(true)
          setInput("")
          void onSend(completedText, [])
        }
      },
      onError: (error) => {
        halfDuplexActiveRef.current = false
        setHalfDuplexActive(false)
        setHalfDuplexWaiting(false)
        setVoiceError(error.message)
      },
    })
    voiceServiceRef.current = service
    try {
      await service.start({ configId: sttConfigId })
    } catch {
      if (voiceServiceRef.current === service) voiceServiceRef.current = null
    }
  }

  const toggleVoiceInput = async () => {
    if (!voiceInputEnabled || isThinking || voiceStatus === "connecting" || voiceStatus === "transcribing") return
    if (voiceStatus === "recording") {
      halfDuplexActiveRef.current = false
      setHalfDuplexActive(false)
      setHalfDuplexWaiting(false)
      const service = voiceServiceRef.current
      if (!service) return
      try {
        await service.finish()
      } catch (error) {
        setVoiceError(error instanceof Error ? error.message : "语音转写失败")
      } finally {
        if (voiceServiceRef.current === service) voiceServiceRef.current = null
      }
      return
    }
    halfDuplexActiveRef.current = true
    setHalfDuplexActive(true)
    await startVoiceInput()
  }

  useEffect(() => {
    if (!halfDuplexActive) return
    const outputActive = isThinking || speechOutputPending
    if (outputActive) {
      halfDuplexResponseObservedRef.current = true
      const service = voiceServiceRef.current
      if (service) {
        voiceServiceRef.current = null
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
  }, [halfDuplexActive, halfDuplexWaiting, isThinking, speechOutputPending, sttConfigId, voiceStatus])

  const replyPermission = async (reply: "once" | "reject") => {
    if (!permission || submitting) return
    setSubmitting(reply)
    try {
      await onPermissionReply(permission.id, reply)
    } finally {
      setSubmitting(null)
    }
  }

  const replyQuestion = async (label: string) => {
    if (!question || submitting) return
    setSubmitting(label)
    try {
      await onQuestionReply(question.id, [[label]])
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="flex h-full w-full flex-col gap-[3cqh] [container-type:size]" style={{ fontSize: `${3.5 * fontRatio}cqh` }}>
      <section
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6cqh] border border-white/12 bg-stone-900/90 text-stone-100 shadow-[0_2cqh_6cqh_rgba(0,0,0,0.28)] backdrop-blur-xl"
        style={{ backgroundColor: `rgba(28,25,23,${Math.max(30, Math.min(100, opacity)) / 100})` }}
      >
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-[6cqh] pb-[3cqh] pt-[6cqh] [scrollbar-color:rgba(168,162,158,0.45)_transparent] [scrollbar-width:thin]"
        >
          {visibleSegments.length > 0 ? (
            <div className="grid gap-[2cqh]">
              {visibleSegments.map((segment, index) => {
                const assistant = segment.speaker === assistantName
                const startsNewSpeaker = index > 0 && visibleSegments[index - 1]?.speaker !== segment.speaker
                if (segment.thinking || segment.runtimeTrace) {
                  const isThinkingSegment = Boolean(segment.thinking)
                  const traceLabel = isThinkingSegment ? "思考" : "运行过程"
                  const traceContent = segment.thinking || segment.runtimeTrace
                  const TraceIcon = isThinkingSegment ? Sparkles : Activity
                  const segmentID = `${isThinkingSegment ? "thinking" : "runtime"}-${index}`
                  const expanded = expandedSegments.has(segmentID)
                  return (
                    <div
                      key={`${segment.speaker}-${index}-thinking`}
                      className={cn("min-w-0 text-stone-400", startsNewSpeaker && "mt-[4cqh]")}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSegment(segmentID)}
                        className="flex w-full min-w-0 items-center gap-[2cqh] text-left transition-colors hover:text-stone-200"
                        aria-expanded={expanded}
                      >
                        <TraceIcon
                          className={cn(
                            "h-[4.5cqh] w-[4.5cqh] shrink-0",
                            isThinkingSegment ? "text-orange-500" : "text-sky-400",
                          )}
                        />
                        <span className={cn("shrink-0", isThinkingSegment ? "text-orange-400" : "text-sky-300")}>
                          {traceLabel}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{traceContent}</span>
                        <ChevronRight
                          className={cn(
                            "h-[4cqh] w-[4cqh] shrink-0 text-stone-500 transition-transform",
                            expanded && "rotate-90",
                          )}
                        />
                      </button>
                      {expanded ? (
                        <div className="mt-[2cqh] whitespace-pre-wrap rounded-[3cqh] border border-white/8 bg-black/20 px-[4cqh] py-[3cqh] leading-[1.55] text-stone-300 [overflow-wrap:anywhere]">
                          {traceContent}
                        </div>
                      ) : null}
                    </div>
                  )
                }
                if (segment.tool) {
                  const segmentID = `tool-${segment.tool.id}`
                  const expanded = expandedSegments.has(segmentID)
                  return (
                    <div
                      key={`${segment.speaker}-${index}-${segment.tool.id}`}
                      className={cn("min-w-0 text-stone-400", startsNewSpeaker && "mt-[4cqh]")}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSegment(segmentID)}
                        className="flex w-full min-w-0 items-center gap-[2cqh] text-left transition-colors hover:text-stone-200"
                        aria-expanded={expanded}
                      >
                        <Wrench className="h-[4.5cqh] w-[4.5cqh] shrink-0 text-violet-400" />
                        <span className="shrink-0 text-violet-300">工具:</span>
                        <span className="min-w-0 flex-1 truncate text-violet-300">{segment.tool.name}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-[2cqh] py-[0.7cqh] text-[0.82em]",
                            segment.tool.status === "error"
                              ? "border-red-400/30 bg-red-400/10 text-red-300"
                              : "border-white/12 bg-white/5 text-stone-400",
                          )}
                        >
                          {toolStatus(segment.tool.status)}
                        </span>
                        {segment.tool.duration ? (
                          <span className="shrink-0 font-mono text-[0.82em] tracking-[0.08em] text-stone-500">
                            {segment.tool.duration}MS
                          </span>
                        ) : null}
                        <ChevronRight
                          className={cn(
                            "h-[4cqh] w-[4cqh] shrink-0 text-stone-500 transition-transform",
                            expanded && "rotate-90",
                          )}
                        />
                      </button>
                      {expanded ? (
                        <div className="mt-[2cqh] grid gap-[2cqh] rounded-[3cqh] border border-white/8 bg-black/20 px-[4cqh] py-[3cqh] text-stone-300">
                          <div>状态：{toolStatus(segment.tool.status)}</div>
                          {segment.tool.input ? (
                            <pre className="min-w-0 max-w-full whitespace-pre-wrap rounded-[2cqh] bg-black/20 p-[2.5cqh] [overflow-wrap:anywhere]">
                              {segment.tool.input}
                            </pre>
                          ) : null}
                          {segment.tool.output ? (
                            <pre className="min-w-0 max-w-full whitespace-pre-wrap rounded-[2cqh] bg-black/20 p-[2.5cqh] [overflow-wrap:anywhere]">
                              {segment.tool.output}
                            </pre>
                          ) : null}
                          {segment.tool.error ? (
                            <pre className="min-w-0 max-w-full whitespace-pre-wrap rounded-[2cqh] bg-red-950/30 p-[2.5cqh] text-red-200 [overflow-wrap:anywhere]">
                              {segment.tool.error}
                            </pre>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                }
                const speechSegmentID = assistant ? segment.speechSegmentId : undefined
                const speechClip = speechSegmentID ? speechClips[speechSegmentID] : undefined
                const speechClipPlaying = Boolean(
                  speechSegmentID && activeSpeechSegmentId === speechSegmentID && !speechPaused,
                )
                const content = segmentText(segment)
                return (
                  <div
                    key={`${segment.speaker}-${index}-${content.slice(0, 16)}`}
                    className={cn(
                      "flex items-start gap-[3cqh]",
                      assistant ? "justify-start" : "justify-center",
                      startsNewSpeaker && "mt-[4cqh]",
                    )}
                  >
                    {assistant ? (
                      <div className="flex w-full min-w-0 items-end gap-[2cqh] pt-[0.5cqh] text-stone-100">
                        <div className="min-w-0 flex-1">
                          <DesktopPetMarkdown content={content} />
                        </div>
                        {speechSegmentID && speechClip?.status === "synthesizing" ? (
                          <span
                            className="mb-[0.2cqh] inline-flex h-[5cqh] w-[5cqh] shrink-0 text-stone-500"
                            title="正在合成语音"
                          >
                            <LoaderCircle className="h-full w-full animate-spin" />
                          </span>
                        ) : null}
                        {speechSegmentID && speechClip?.status === "ready" ? (
                          <button
                            type="button"
                            onClick={() => toggleSpeechClip(speechSegmentID)}
                            className={cn(
                              "mb-[0.2cqh] inline-flex h-[5cqh] w-[5cqh] shrink-0 items-center justify-center rounded-full transition-colors",
                              speechClipPlaying
                                ? "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25"
                                : "text-stone-400 hover:bg-white/8 hover:text-stone-200",
                            )}
                            aria-label={speechClipPlaying ? "暂停这段语音" : "播放这段语音"}
                            title={speechClipPlaying ? "暂停" : "播放"}
                          >
                            {speechClipPlaying ? (
                              <Pause className="h-[3.5cqh] w-[3.5cqh] fill-current" />
                            ) : (
                              <Play className="h-[3.5cqh] w-[3.5cqh] fill-current" />
                            )}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <p className="max-w-[86%] whitespace-pre-wrap py-[0.5cqh] text-center font-serif text-[0.94em] leading-[1.4] text-stone-500 [overflow-wrap:anywhere]">
                        {content}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center text-stone-200">
              <span>今天需要我做什么？</span>
            </div>
          )}
          {isThinking ? (
            <div className="mt-[4cqh] flex items-center gap-[2cqh] text-stone-400">
              <LoaderCircle className="h-[5cqh] w-[5cqh] animate-spin" />
              <span>正在处理…</span>
            </div>
          ) : null}
        </div>

        <div className="flex h-[22%] min-h-0 shrink-0 items-center gap-[3cqh] border-t border-white/8 px-[5cqh] py-[3cqh]">
          <div className="flex h-full min-w-0 flex-1 items-center gap-[2cqh] rounded-[5cqh] border border-white/20 px-[4cqh] focus-within:border-white/35">
            <input
              value={input}
              readOnly={voiceBusy}
              onChange={(event) => setInput(event.target.value)}
              onFocus={() => void updateDesktopActivityFacts({
                surface: "pet-bubble",
                chat_input_focused: true,
                last_user_interaction_at: new Date().toISOString(),
              })}
              onBlur={() => void updateDesktopActivityFacts({
                surface: "pet-bubble",
                chat_input_focused: false,
              })}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void send()
                }
              }}
              placeholder={
                voiceStatus === "recording"
                  ? "正在聆听…"
                  : voiceStatus === "connecting"
                    ? "正在连接语音服务…"
                    : voiceStatus === "transcribing"
                      ? "正在完成转写…"
                      : "输入消息…"
              }
              className="min-w-0 flex-1 bg-transparent text-stone-100 outline-none placeholder:text-stone-400"
            />
            {voiceInputEnabled ? (
              <button
                type="button"
                onClick={() => void toggleVoiceInput()}
                disabled={isThinking || voiceStatus === "connecting" || voiceStatus === "transcribing"}
                className={cn(
                  "flex h-[8cqh] w-[8cqh] shrink-0 items-center justify-center rounded-full transition-[color,background-color,transform] disabled:cursor-wait",
                  voiceStatus === "recording"
                    ? "bg-red-500/18 text-red-400"
                    : voiceError
                      ? "text-red-400 hover:bg-red-500/10"
                      : "text-stone-400 hover:bg-white/8 hover:text-stone-200",
                )}
                style={{ transform: voiceStatus === "recording" ? `scale(${1 + voiceLevel * 0.12})` : undefined }}
                aria-label={voiceStatus === "recording" ? "停止录音" : "开始语音输入"}
                title={voiceError || (voiceStatus === "recording" ? "停止录音" : "语音输入")}
              >
                {voiceStatus === "connecting" || voiceStatus === "transcribing" ? (
                  <LoaderCircle className="h-[5cqh] w-[5cqh] animate-spin" />
                ) : voiceStatus === "recording" ? (
                  <Square className="h-[3.8cqh] w-[3.8cqh] fill-current" />
                ) : (
                  <Mic className="h-[5cqh] w-[5cqh]" />
                )}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void (isThinking ? onAbort() : send())}
            disabled={!isThinking && !canSend}
            className={cn(
              "flex aspect-square h-full max-h-[12cqh] items-center justify-center rounded-full text-white transition-colors disabled:text-white/75",
              isThinking
                ? "bg-stone-600 hover:bg-stone-500"
                : "bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/60",
            )}
            aria-label={isThinking ? "停止生成" : "发送"}
            title={isThinking ? "停止生成" : "发送"}
          >
            {isThinking ? (
              <Square className="h-[34%] w-[34%] fill-current" />
            ) : (
              <ArrowUp className="h-[52%] w-[52%]" />
            )}
          </button>
        </div>
      </section>

      {attentionVisible ? (
        <section className="flex h-[22%] min-h-0 shrink-0 items-center gap-[3cqh] rounded-[5cqh] border border-white/10 bg-stone-800/88 px-[5cqh] text-stone-100 shadow-[0_1.5cqh_4cqh_rgba(0,0,0,0.22)] backdrop-blur-xl">
          <Info className="h-[5cqh] w-[5cqh] shrink-0 text-stone-300" />
          <span className="min-w-0 flex-1 truncate text-stone-200">
            {permission ? `需要权限：${permission.permission}` : question?.questions[0]?.question || "需要你的确认"}
          </span>
          {permission ? (
            <>
              <button
                type="button"
                onClick={() => void replyPermission("once")}
                disabled={Boolean(submitting)}
                className="shrink-0 px-[2cqh] py-[2cqh] font-medium text-orange-400 disabled:opacity-50"
              >
                {submitting === "once" ? "处理中" : "允许一次"}
              </button>
              <button
                type="button"
                onClick={() => void replyPermission("reject")}
                disabled={Boolean(submitting)}
                className="shrink-0 px-[2cqh] py-[2cqh] text-stone-300 disabled:opacity-50"
              >
                拒绝
              </button>
            </>
          ) : (
            <>
              {(question?.questions[0]?.options ?? []).slice(0, 2).map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => void replyQuestion(option.label)}
                  disabled={Boolean(submitting)}
                  className="shrink-0 px-[2cqh] py-[2cqh] text-orange-400 disabled:opacity-50"
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void onQuestionReject(question!.id)}
                disabled={Boolean(submitting)}
                className="shrink-0 px-[2cqh] py-[2cqh] text-stone-300 disabled:opacity-50"
              >
                暂不处理
              </button>
            </>
          )}
        </section>
      ) : null}
    </div>
  )
}
