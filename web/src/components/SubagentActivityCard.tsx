import { Bot, Check, ChevronDown, ChevronUp, Circle, LoaderCircle, OctagonX } from "lucide-react"
import { useMemo, useState } from "react"
import type { SubagentStatus, SubagentThread, SubagentThreadDetails } from "../types"

const statusText: Record<SubagentStatus, string> = {
  created: "已创建",
  queued: "等待中",
  running: "运行中",
  waiting: "等待消息",
  completed: "已完成",
  failed: "失败",
  interrupted: "已中断",
  cancelled: "已取消",
}

function StatusIcon({ status }: { status: SubagentStatus }) {
  if (status === "running") return <LoaderCircle className="h-[1.7vh] w-[1.7vh] animate-spin text-accent" />
  if (status === "completed") return <Check className="h-[1.7vh] w-[1.7vh] text-emerald-600" />
  if (status === "failed" || status === "interrupted" || status === "cancelled") {
    return <OctagonX className="h-[1.7vh] w-[1.7vh] text-red-500" />
  }
  return <Circle className="h-[1.5vh] w-[1.5vh] text-text-muted" />
}

function metadataText(thread: SubagentThread, key: string) {
  const value = thread.metadata?.[key]
  return typeof value === "string" && value.trim() ? value : undefined
}

export function SubagentActivityCard({
  threads,
  onFollowup,
  onInspect,
  onInterrupt,
}: {
  threads: SubagentThread[]
  onFollowup?: (target: string, message: string) => Promise<unknown>
  onInspect?: (target: string) => Promise<SubagentThreadDetails>
  onInterrupt?: (target: string) => Promise<unknown>
}) {
  const [expanded, setExpanded] = useState(false)
  const [interrupting, setInterrupting] = useState<string>()
  const [interruptError, setInterruptError] = useState<string>()
  const [inspecting, setInspecting] = useState<string>()
  const [details, setDetails] = useState<SubagentThreadDetails>()
  const [detailError, setDetailError] = useState<string>()
  const [followupTarget, setFollowupTarget] = useState<string>()
  const [followupText, setFollowupText] = useState("")
  const [submittingFollowup, setSubmittingFollowup] = useState(false)
  const [followupError, setFollowupError] = useState<string>()
  const ordered = useMemo(
    () => [...threads].sort((left, right) => left.createdAt - right.createdAt),
    [threads],
  )
  if (!ordered.length) return null
  const running = ordered.filter((item) => ["created", "queued", "running", "waiting"].includes(item.status)).length
  const failed = ordered.filter((item) => item.status === "failed").length
  const completed = ordered.filter((item) => item.status === "completed").length

  return (
    <section className="mx-auto my-[2.2vh] w-[86%] overflow-hidden rounded-[1.4vh] border border-border bg-card/95 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center gap-[0.9vw] px-[1.2vw] py-[1.35vh] text-left"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="flex h-[3.2vh] w-[3.2vh] items-center justify-center rounded-full bg-accent/10 text-accent">
          <Bot className="h-[1.8vh] w-[1.8vh]" />
        </span>
        <span className="font-serif text-[1.85vh] text-text">后台子智能体</span>
        <span className="text-[1.55vh] text-text-muted">
          {running ? `${running} 个运行中` : `${completed} 个已完成`}{failed ? ` · ${failed} 个失败` : ""}
        </span>
        <span className="ml-auto text-text-muted">
          {expanded ? <ChevronUp className="h-[1.8vh] w-[1.8vh]" /> : <ChevronDown className="h-[1.8vh] w-[1.8vh]" />}
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-border px-[1.2vw] py-[0.8vh]">
          {ordered.map((thread) => (
            <div key={thread.id} className="flex gap-[0.8vw] border-b border-border/60 py-[1.15vh] last:border-b-0">
              <span className="pt-[0.35vh]"><StatusIcon status={thread.status} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-[0.7vw]">
                  <span className="truncate font-serif text-[1.7vh] text-text">{thread.taskName}</span>
                  <span className="text-[1.45vh] text-text-muted">{thread.role}</span>
                  {metadataText(thread, "sandboxMode") ? (
                    <span className="rounded-full bg-bg/65 px-[0.45vw] py-[0.1vh] text-[1.25vh] text-text-muted">
                      {metadataText(thread, "sandboxMode")}
                    </span>
                  ) : null}
                  <span className="ml-auto text-[1.45vh] text-text-muted">{statusText[thread.status]}</span>
                  {onInspect ? (
                    <button
                      type="button"
                      className="rounded-md border border-border px-[0.55vw] py-[0.2vh] text-[1.35vh] text-text-muted hover:border-accent/50 hover:text-accent disabled:cursor-wait disabled:opacity-50"
                      disabled={inspecting === thread.agentPath}
                      onClick={async (event) => {
                        event.stopPropagation()
                        if (details?.thread.id === thread.id) {
                          setDetails(undefined)
                          return
                        }
                        setDetailError(undefined)
                        setInspecting(thread.agentPath)
                        try {
                          setDetails(await onInspect(thread.agentPath))
                        } catch (error) {
                          setDetailError(error instanceof Error ? error.message : "读取子智能体详情失败。")
                        } finally {
                          setInspecting(undefined)
                        }
                      }}
                    >
                      {inspecting === thread.agentPath ? "读取中" : details?.thread.id === thread.id ? "收起" : "详情"}
                    </button>
                  ) : null}
                  {onFollowup && ["completed", "failed", "interrupted", "cancelled"].includes(thread.status) ? (
                    <button
                      type="button"
                      className="rounded-md border border-border px-[0.55vw] py-[0.2vh] text-[1.35vh] text-text-muted hover:border-accent/50 hover:text-accent"
                      onClick={(event) => {
                        event.stopPropagation()
                        setFollowupError(undefined)
                        setFollowupText("")
                        setFollowupTarget((current) => current === thread.agentPath ? undefined : thread.agentPath)
                      }}
                    >
                      {followupTarget === thread.agentPath ? "取消" : "继续"}
                    </button>
                  ) : null}
                  {onInterrupt && ["created", "queued", "running", "waiting"].includes(thread.status) ? (
                    <button
                      type="button"
                      className="rounded-md border border-border px-[0.55vw] py-[0.2vh] text-[1.35vh] text-text-muted hover:border-red-300 hover:text-red-600 disabled:cursor-wait disabled:opacity-50"
                      disabled={interrupting === thread.agentPath}
                      onClick={async (event) => {
                        event.stopPropagation()
                        setInterruptError(undefined)
                        setInterrupting(thread.agentPath)
                        try {
                          await onInterrupt(thread.agentPath)
                        } catch (error) {
                          setInterruptError(error instanceof Error ? error.message : "中断子智能体失败。")
                        } finally {
                          setInterrupting(undefined)
                        }
                      }}
                    >
                      {interrupting === thread.agentPath ? "处理中" : "中断"}
                    </button>
                  ) : null}
                </div>
                <div className="mt-[0.35vh] truncate font-mono text-[1.35vh] text-text-muted">{thread.agentPath}</div>
                {metadataText(thread, "model") ? (
                  <div className="mt-[0.25vh] truncate text-[1.3vh] text-text-muted">
                    模型：{metadataText(thread, "model")}
                    {metadataText(thread, "thinkingLevel") ? ` · 推理 ${metadataText(thread, "thinkingLevel")}` : ""}
                  </div>
                ) : null}
                {thread.error ? <p className="mt-[0.6vh] text-[1.45vh] text-red-600">{thread.error}</p> : null}
                {thread.result?.summary ? (
                  <p className="mt-[0.6vh] line-clamp-2 text-[1.5vh] leading-relaxed text-text-muted">
                    {thread.result.summary}
                  </p>
                ) : null}
                {followupTarget === thread.agentPath && onFollowup ? (
                  <form
                    className="mt-[0.8vh] flex gap-[0.55vw]"
                    onSubmit={async (event) => {
                      event.preventDefault()
                      const message = followupText.trim()
                      if (!message) return
                      setFollowupError(undefined)
                      setSubmittingFollowup(true)
                      try {
                        await onFollowup(thread.agentPath, message)
                        setFollowupText("")
                        setFollowupTarget(undefined)
                      } catch (error) {
                        setFollowupError(error instanceof Error ? error.message : "追加任务失败。")
                      } finally {
                        setSubmittingFollowup(false)
                      }
                    }}
                  >
                    <input
                      value={followupText}
                      onChange={(event) => setFollowupText(event.target.value)}
                      placeholder="输入追加任务"
                      className="min-w-0 flex-1 rounded-md border border-border bg-card px-[0.65vw] py-[0.45vh] text-[1.4vh] text-text outline-none focus:border-accent/60"
                    />
                    <button
                      type="submit"
                      disabled={!followupText.trim() || submittingFollowup}
                      className="rounded-md bg-accent px-[0.75vw] py-[0.4vh] text-[1.35vh] text-white disabled:opacity-45"
                    >
                      {submittingFollowup ? "提交中" : "提交"}
                    </button>
                  </form>
                ) : null}
                {details?.thread.id === thread.id ? (
                  <div className="mt-[0.9vh] rounded-[0.8vh] border border-border/70 bg-bg/40 px-[0.8vw] py-[0.8vh]">
                    <div className="flex flex-wrap gap-x-[1.1vw] gap-y-[0.3vh] text-[1.35vh] text-text-muted">
                      <span>持久化事件 {details.events.length}</span>
                      <span>上下文消息 {details.checkpoint?.messageCount ?? details.checkpoint?.messages?.length ?? 0}</span>
                      <span>技能 {details.checkpoint?.activeSkillIDs?.join("、") || "无"}</span>
                      {details.checkpoint?.budget && details.checkpoint?.budgetUsage ? (
                        <>
                          <span>
                            轮次 {details.checkpoint.budgetUsage.turnCount ?? 0}/{details.checkpoint.budget.maxTurns ?? "—"}
                          </span>
                          <span>
                            工具 {details.checkpoint.budgetUsage.toolCallCount ?? 0}/{details.checkpoint.budget.maxToolCalls ?? "—"}
                          </span>
                          <span>
                            用时 {Math.ceil((details.checkpoint.budgetUsage.elapsedMs ?? 0) / 1000)}秒/{details.checkpoint.budget.timeoutSeconds ?? "—"}秒
                          </span>
                        </>
                      ) : null}
                    </div>
                    {details.checkpoint?.budgetUsage?.exceededReason ? (
                      <p className="mt-[0.55vh] text-[1.35vh] text-red-600">
                        {details.checkpoint.budgetUsage.exceededReason}
                      </p>
                    ) : null}
                    {details.events.length ? (
                      <div className="mt-[0.65vh] space-y-[0.3vh] font-mono text-[1.25vh] text-text-muted">
                        {details.events.slice(-8).map((item, index) => (
                          <div key={String(item.sequenceID ?? index)} className="flex gap-[0.7vw]">
                            <span className="w-[5.5vw] shrink-0 truncate">{String(item.type ?? "event")}</span>
                            <span className="truncate">{String(item.toolName ?? item.status ?? item.reason ?? "")}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {detailError ? <p className="py-[0.7vh] text-[1.4vh] text-red-600">{detailError}</p> : null}
          {followupError ? <p className="py-[0.7vh] text-[1.4vh] text-red-600">{followupError}</p> : null}
          {interruptError ? <p className="py-[0.7vh] text-[1.4vh] text-red-600">{interruptError}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
