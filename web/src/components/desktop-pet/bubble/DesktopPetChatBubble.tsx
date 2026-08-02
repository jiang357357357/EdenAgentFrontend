import { Activity, ArrowUp, ChevronRight, Info, LoaderCircle, Mic, Pause, Play, Sparkles, Square, Wrench } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  setDesktopPetBubbleKeyboardFocus,
  updateDesktopActivityFacts,
} from "../../../lib/desktop-window"
import { normalizePetDialogSegments } from "../../../lib/pet-dialog-segments"
import { cn } from "../../../lib/utils"
import { useRealtimeVoiceInput } from "../../chat/input/hooks/useRealtimeVoiceInput"
import { DesktopPetMarkdown, segmentText, toolStatus } from "./PetDialogContent"
import { usePetSpeechPlayback } from "./hooks/usePetSpeechPlayback"
import type { DesktopPetChatBubbleProps } from "./types"

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    activeSpeechSegmentId,
    speechClips,
    speechOutputActive,
    speechPaused,
    stopSpeechPlayback,
    toggleSpeechClip,
  } = usePetSpeechPlayback({ isThinking, latestAssistantMessage, sessionId, ttsConfigId, ttsMode })
  const {
    toggleVoiceInput,
    voiceBusy,
    voiceError,
    voiceLevel,
    voiceStatus,
  } = useRealtimeVoiceInput({
    disabled: isThinking,
    halfDuplexOutputActive: speechOutputActive,
    input,
    onSend: (text) => void onSend(text, []),
    onStart: () => stopSpeechPlayback(),
    overlay: false,
    setInput,
    sttConfigId,
    surface: "pet-bubble",
    voiceInputEnabled,
  })
  const visibleSegments = useMemo(
    () => normalizePetDialogSegments(dialogSegments).filter((segment) => Boolean(segmentText(segment))),
    [dialogSegments],
  )
  const scrollKey = visibleSegments.map((segment) => `${segmentText(segment).length}:${segment.tool?.status ?? ""}`).join("|")
  const permission = permissions[0]
  const question = questions[0]
  const attentionVisible = Boolean(permission || question)
  const fontRatio = Math.max(70, Math.min(140, fontScale)) / 100
  const canSend = input.trim().length > 0 && !isThinking && !voiceBusy

  const toggleSegment = (id: string) => {
    setExpandedSegments((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [scrollKey])

  useEffect(() => {
    return () => {
      void setDesktopPetBubbleKeyboardFocus(false)
      void updateDesktopActivityFacts({
        surface: "pet-bubble",
        chat_input_focused: false,
        voice_recording: false,
        tts_playing: false,
      })
    }
  }, [])

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
                const speechMessageID = assistant ? segment.speechMessageId : undefined
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
                        {speechSegmentID && speechMessageID && ttsMode !== "none" && speechClip?.status !== "synthesizing" ? (
                          <button
                            type="button"
                            onClick={() => toggleSpeechClip(speechSegmentID, speechMessageID, content)}
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
              ref={inputRef}
              value={input}
              readOnly={voiceBusy}
              onPointerDown={(event) => {
                if (!window.monAgentDesktop || voiceBusy) return
                event.preventDefault()
                void setDesktopPetBubbleKeyboardFocus(true).then((granted) => {
                  if (granted) inputRef.current?.focus({ preventScroll: true })
                })
              }}
              onChange={(event) => setInput(event.target.value)}
              onFocus={() => void updateDesktopActivityFacts({
                surface: "pet-bubble",
                chat_input_focused: true,
                last_user_interaction_at: new Date().toISOString(),
              })}
              onBlur={() => {
                void setDesktopPetBubbleKeyboardFocus(false)
                void updateDesktopActivityFacts({
                  surface: "pet-bubble",
                  chat_input_focused: false,
                })
              }}
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
