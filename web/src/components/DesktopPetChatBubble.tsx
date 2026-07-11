import { ArrowUp, ChevronRight, Info, LoaderCircle, Mic, Sparkles, Wrench } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { PendingPermission, PendingQuestion, PromptAttachment, ToolCall } from "../types"
import { cn } from "../lib/utils"

interface PetDialogSegment {
  speaker: string
  text?: string
  runtimeTrace?: string
  thinking?: string
  tool?: ToolCall
}

interface DesktopPetChatBubbleProps {
  assistantName: string
  dialogSegments: PetDialogSegment[]
  isThinking: boolean
  permissions: PendingPermission[]
  questions: PendingQuestion[]
  opacity: number
  fontScale: number
  onSend: (content: string, attachments: PromptAttachment[]) => Promise<void>
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

export function DesktopPetChatBubble({
  assistantName,
  dialogSegments,
  isThinking,
  permissions,
  questions,
  opacity,
  fontScale,
  onSend,
  onPermissionReply,
  onQuestionReply,
  onQuestionReject,
}: DesktopPetChatBubbleProps) {
  const [input, setInput] = useState("")
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(() => new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const visibleSegments = useMemo(
    () => dialogSegments.filter((segment) => Boolean(segmentText(segment))),
    [dialogSegments],
  )
  const scrollKey = visibleSegments.map((segment) => `${segmentText(segment).length}:${segment.tool?.status ?? ""}`).join("|")
  const permission = permissions[0]
  const question = questions[0]
  const attentionVisible = Boolean(permission || question)
  const fontRatio = Math.max(70, Math.min(140, fontScale)) / 100
  const canSend = input.trim().length > 0 && !isThinking

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

  const send = async () => {
    const content = input.trim()
    if (!content || isThinking) return
    setInput("")
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
            <div className="grid gap-[4cqh]">
              {visibleSegments.map((segment, index) => {
                const assistant = segment.speaker === assistantName
                if (segment.thinking || segment.runtimeTrace) {
                  const segmentID = `thinking-${index}`
                  const expanded = expandedSegments.has(segmentID)
                  return (
                    <div
                      key={`${segment.speaker}-${index}-thinking`}
                      className="min-w-0 text-stone-400"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSegment(segmentID)}
                        className="flex w-full min-w-0 items-center gap-[2cqh] text-left transition-colors hover:text-stone-200"
                        aria-expanded={expanded}
                      >
                        <Sparkles className="h-[4.5cqh] w-[4.5cqh] shrink-0 text-orange-500" />
                        <span className="shrink-0 text-stone-300">思考</span>
                        <span className="min-w-0 flex-1 truncate">{segment.thinking || segment.runtimeTrace}</span>
                        <ChevronRight
                          className={cn(
                            "h-[4cqh] w-[4cqh] shrink-0 text-stone-500 transition-transform",
                            expanded && "rotate-90",
                          )}
                        />
                      </button>
                      {expanded ? (
                        <div className="mt-[2cqh] whitespace-pre-wrap rounded-[3cqh] border border-white/8 bg-black/20 px-[4cqh] py-[3cqh] leading-[1.55] text-stone-300 [overflow-wrap:anywhere]">
                          {segment.thinking || segment.runtimeTrace}
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
                      className="min-w-0 text-stone-400"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSegment(segmentID)}
                        className="flex w-full min-w-0 items-center gap-[2cqh] text-left transition-colors hover:text-stone-200"
                        aria-expanded={expanded}
                      >
                        <Wrench className="h-[4.5cqh] w-[4.5cqh] shrink-0 text-orange-500" />
                        <span className="shrink-0 text-stone-300">工具:</span>
                        <span className="min-w-0 flex-1 truncate text-stone-300">{segment.tool.name}</span>
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
                return (
                  <div
                    key={`${segment.speaker}-${index}-${segmentText(segment).slice(0, 16)}`}
                    className={cn("flex items-start gap-[3cqh]", assistant ? "justify-start" : "justify-end")}
                  >
                    <p
                      className={cn(
                        "whitespace-pre-wrap leading-[1.5] [overflow-wrap:anywhere]",
                        assistant
                          ? "w-full max-w-none pt-[1cqh] text-stone-100"
                          : "max-w-[86%] rounded-[4cqh] bg-orange-600/75 px-[4cqh] py-[2.4cqh] text-white",
                      )}
                    >
                      {segmentText(segment)}
                    </p>
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
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void send()
                }
              }}
              placeholder="输入消息…"
              className="min-w-0 flex-1 bg-transparent text-stone-100 outline-none placeholder:text-stone-400"
            />
            <Mic className="h-[5cqh] w-[5cqh] shrink-0 text-stone-400" aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            className="flex aspect-square h-full max-h-[12cqh] items-center justify-center rounded-full bg-orange-600 text-white transition-colors hover:bg-orange-500 disabled:bg-orange-600/60 disabled:text-white/75"
            aria-label="发送"
            title="发送"
          >
            <ArrowUp className="h-[52%] w-[52%]" />
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
