import { Bot, Check, ChevronDown, Circle, LoaderCircle, OctagonX, Wrench } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import type { CoordinationBatch, SubagentStatus, SubagentThread, SubagentThreadDetails } from "../../../types"
import { cn } from "../../../lib/utils"
import { ThinkingBlock } from "./ThinkingBlock"

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

type ChildTimelineItem =
  | { id: string; type: "thinking"; content: string }
  | { id: string; type: "tool"; name: string; status: "running" | "completed" | "error" }

function childTimeline(events: Array<Record<string, unknown>>): ChildTimelineItem[] {
  const toolEnds = new Map<string, Record<string, unknown>>()
  for (const event of events) {
    if (event.type === "tool_execution_end" && typeof event.toolCallId === "string") {
      toolEnds.set(event.toolCallId, event)
    }
  }
  const timeline: ChildTimelineItem[] = []
  for (const [index, event] of events.entries()) {
    if (event.type === "message_end") {
      const message = event.message as Record<string, unknown> | undefined
      if (message?.role !== "assistant" || !Array.isArray(message.content)) continue
      for (const [contentIndex, part] of message.content.entries()) {
        if (!part || typeof part !== "object") continue
        const record = part as Record<string, unknown>
        if (record.type === "thinking" && typeof record.thinking === "string" && record.thinking.trim()) {
          timeline.push({ id: `thinking-${index}-${contentIndex}`, type: "thinking", content: record.thinking })
        }
      }
    }
    if (event.type === "tool_execution_start") {
      const callID = typeof event.toolCallId === "string" ? event.toolCallId : `tool-${index}`
      const end = toolEnds.get(callID)
      timeline.push({
        id: callID,
        type: "tool",
        name: typeof event.toolName === "string" ? event.toolName : "tool",
        status: end ? (end.isError === true ? "error" : "completed") : "running",
      })
    }
  }
  return timeline.slice(-16)
}

export function SubagentActivityCard({
  threads,
  batches = [],
  onFollowup,
  onInspect,
  onInterrupt,
  embedded = false,
}: {
  threads: SubagentThread[]
  batches?: CoordinationBatch[]
  onFollowup?: (target: string, message: string) => Promise<unknown>
  onInspect?: (target: string) => Promise<SubagentThreadDetails>
  onInterrupt?: (target: string) => Promise<unknown>
  embedded?: boolean
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
  useEffect(() => {
    if (!embedded || !onInspect || !ordered[0]) return
    let active = true
    let loading = false
    const target = ordered[0].agentPath
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const value = await onInspect(target)
        if (active) setDetails(value)
      } catch (error) {
        if (active) setDetailError(error instanceof Error ? error.message : "读取子智能体详情失败。")
      } finally {
        loading = false
        if (active) setInspecting(undefined)
      }
    }
    setInspecting(target)
    void load()
    const isActive = ["created", "queued", "running", "waiting"].includes(ordered[0].status)
    const timer = isActive ? window.setInterval(() => { void load() }, 2_000) : undefined
    return () => {
      active = false
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [embedded, onInspect, ordered[0]?.agentPath, ordered[0]?.status, ordered[0]?.updatedAt])
  if (!ordered.length) return null
  const running = ordered.filter((item) => ["created", "queued", "running", "waiting"].includes(item.status)).length
  const failed = ordered.filter((item) => item.status === "failed").length
  const completed = ordered.filter((item) => item.status === "completed").length
  const activeBatch = [...batches]
    .reverse()
    .find((item) => !["completed", "cancelled"].includes(item.status))
  const activeBatchThreads = activeBatch
    ? ordered.filter((item) => item.metadata?.coordinationBatchID === activeBatch.batchID)
    : []
  const requiredBatchThreads = activeBatchThreads.filter((item) => item.metadata?.requiredForFinal === true)
  const requiredTotal = Math.max(activeBatch?.requiredTotal ?? 0, requiredBatchThreads.length)
  const requiredTerminal = Math.max(
    activeBatch?.requiredTerminal ?? 0,
    requiredBatchThreads.filter((item) => ["completed", "failed", "interrupted", "cancelled"].includes(item.status)).length,
  )

  return (
    <section className={cn(
      "overflow-hidden border-border bg-card/95",
      embedded
        ? "border-t bg-violet-50/10"
        : "mx-auto my-[2.2vh] w-[86%] rounded-[1.4vh] border shadow-sm",
    )}>
      <button
        type="button"
        className="flex w-full items-center gap-[0.9vw] px-[1.2vw] py-[1.35vh] text-left"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="flex h-[3.2vh] w-[3.2vh] items-center justify-center rounded-full bg-accent/10 text-accent">
          <Bot className="h-[1.8vh] w-[1.8vh]" />
        </span>
        <span className={cn("text-text", embedded ? "text-[1.42vh] font-medium" : "font-serif text-[1.85vh]")}>子智能体</span>
        <span className="text-[1.55vh] text-text-muted">
          {running ? `${running} 个运行中` : `${completed} 个已完成`}{failed ? ` · ${failed} 个失败` : ""}
        </span>
        {activeBatch ? (
          <span className="rounded-full bg-amber-100 px-[0.55vw] py-[0.15vh] text-[1.3vh] text-amber-700">
            {activeBatch.status === "aggregating"
                ? "正在整合"
              : activeBatch.status === "aggregation_failed"
                ? "整合失败"
                : requiredTotal > 0
                  ? `必要结果 ${requiredTerminal}/${requiredTotal}`
                  : "正在登记任务"}
          </span>
        ) : null}
        <span className="ml-auto text-text-muted">
          <ChevronDown className={cn("h-[1.8vh] w-[1.8vh] transition-transform duration-200", expanded && "rotate-180")} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
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
                  {thread.metadata?.requiredForFinal === true ? (
                    <span className="rounded-full bg-amber-100 px-[0.45vw] py-[0.1vh] text-[1.25vh] text-amber-700">
                      最终回复所需
                    </span>
                  ) : null}
                  <span className="ml-auto text-[1.45vh] text-text-muted">{statusText[thread.status]}</span>
                  {onInspect && !embedded ? (
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
                      <div className="mt-[0.65vh] space-y-[0.35vh]">
                        {childTimeline(details.events).map((item) => item.type === "thinking" ? (
                          <ThinkingBlock
                            key={item.id}
                            content={item.content}
                            state="done"
                            cacheKey={`${thread.id}:${item.id}`}
                          />
                        ) : (
                          <div key={item.id} className="flex items-center gap-[0.8vh] rounded-[0.85vh] border border-border bg-card px-[1vh] py-[0.7vh] text-[1.28vh]">
                            <Wrench className={cn("h-[1.5vh] w-[1.5vh] text-violet-500", item.status === "running" && "animate-pulse")} />
                            <span className="text-violet-600">工具:</span>
                            <span className="font-medium text-violet-700">{item.name}</span>
                            <span className={cn("ml-auto", item.status === "error" ? "text-red-500" : "text-text-muted")}>
                              {item.status === "running" ? "运行中" : item.status === "error" ? "失败" : "完成"}
                            </span>
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
