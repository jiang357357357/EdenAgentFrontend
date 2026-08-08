import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { AlertCircle, ChevronRight, Wrench } from "lucide-react"
import type { CoordinationBatch, SubagentThread, SubagentThreadDetails, ToolCall } from "../../../types"
import { cn } from "../../../lib/utils"
import { SubagentActivityCard } from "./SubagentActivityCard"

interface ToolCardProps {
  tool: ToolCall
  subagentThreads?: SubagentThread[]
  coordinationBatches?: CoordinationBatch[]
  onFollowupSubagent?: (target: string, message: string) => Promise<unknown>
  onInspectSubagent?: (target: string) => Promise<SubagentThreadDetails>
  onInterruptSubagent?: (target: string) => Promise<unknown>
}

function jsonRecord(value?: string): Record<string, unknown> | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function subagentsForTool(tool: ToolCall, threads: SubagentThread[]) {
  if (tool.name !== "spawn_agent") return []
  const input = jsonRecord(tool.input)
  const output = jsonRecord(tool.output)
  const agentID = typeof output?.id === "string" ? output.id : undefined
  const agentPath = typeof output?.agentPath === "string" ? output.agentPath : undefined
  const taskName = typeof input?.task_name === "string" ? input.task_name : undefined
  return threads.filter((thread) =>
    (agentID && thread.id === agentID)
    || (agentPath && thread.agentPath === agentPath)
    || (taskName && thread.taskName === taskName),
  )
}

function statusLabel(status: ToolCall["status"]) {
  if (status === "running") return "运行中"
  if (status === "error") return "失败"
  if (status === "aborted") return "已中止"
  return "完成"
}

export function ToolCard({
  tool,
  subagentThreads = [],
  coordinationBatches = [],
  onFollowupSubagent,
  onInspectSubagent,
  onInterruptSubagent,
}: ToolCardProps) {
  const [expanded, setExpanded] = useState(false)
  const preview = tool.input.replace(/\s+/g, " ").trim()
  const linkedSubagents = subagentsForTool(tool, subagentThreads)
  const linkedBatchIDs = new Set(
    linkedSubagents
      .map((thread) => thread.metadata?.coordinationBatchID)
      .filter((value): value is string => typeof value === "string"),
  )
  const linkedBatches = coordinationBatches.filter((batch) => linkedBatchIDs.has(batch.batchID))

  return (
    <div className="my-[0.65vh] w-full min-w-0 overflow-hidden rounded-[1.1vh] border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full min-w-0 items-center gap-[0.8vh] px-[1.15vh] py-[0.9vh] text-left font-sans text-[1.42vh] transition-colors hover:bg-violet-50/35"
        aria-expanded={expanded}
      >
        <Wrench className={cn("h-[1.65vh] w-[1.65vh] shrink-0 text-violet-500", tool.status === "running" && "animate-pulse")} />
        <span className="shrink-0 text-violet-600">工具:</span>
        <span className="shrink-0 font-medium text-violet-700">{tool.name}</span>
        {preview ? <span className="min-w-0 flex-1 truncate text-text-muted/65">{preview}</span> : <span className="flex-1" />}
        <span
          className={cn(
            "shrink-0 rounded-full border px-[0.8vh] py-[0.12vh] text-[1.12vh]",
            tool.status === "error" || tool.status === "aborted"
              ? "border-red-200 text-red-500"
              : tool.status === "running"
                ? "border-violet-200 text-violet-500"
                : "border-border text-text-muted",
          )}
        >
          {statusLabel(tool.status)}
        </span>
        {tool.duration ? <span className="shrink-0 text-[1.18vh] text-text-muted/60">{tool.duration}ms</span> : null}
        {tool.status === "error" || tool.status === "aborted" ? <AlertCircle className="h-[1.5vh] w-[1.5vh] shrink-0 text-red-500" /> : null}
        <ChevronRight
          className={cn("h-[1.55vh] w-[1.55vh] shrink-0 text-text-muted/60 transition-transform", expanded && "rotate-90")}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid min-w-0 gap-[1vh] border-t border-border bg-violet-50/20 px-[1.2vh] py-[1.1vh]">
              <div className="flex flex-wrap gap-x-[1.2vh] text-[1.25vh] text-text-muted">
                <span>状态：{statusLabel(tool.status)}</span>
                {tool.errorCode ? <span>错误码：{tool.errorCode}</span> : null}
                {typeof tool.retryable === "boolean" ? <span>{tool.retryable ? "可以重试" : "不建议原样重试"}</span> : null}
              </div>
              {tool.input ? (
                <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-[0.9vh] bg-bg/80 p-[0.9vh] font-mono text-[1.28vh] leading-[1.5] text-text">
                  {tool.input}
                </pre>
              ) : null}
              {tool.status === "running" && !tool.output && !tool.error ? (
                <div className="rounded-[0.9vh] border border-violet-200/60 bg-violet-50/55 px-[1vh] py-[0.75vh] text-[1.28vh] text-violet-600">
                  正在执行中…
                </div>
              ) : null}
              {tool.output ? (
                <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-[0.9vh] bg-bg/80 p-[0.9vh] font-mono text-[1.28vh] leading-[1.5] text-text-muted">
                  {tool.output}
                </pre>
              ) : null}
              {tool.error ? (
                <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-[0.9vh] border border-red-200/60 bg-red-50/65 p-[0.9vh] font-mono text-[1.28vh] leading-[1.5] text-red-600">
                  {tool.error}
                </pre>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {linkedSubagents.length ? (
        <SubagentActivityCard
          threads={linkedSubagents}
          batches={linkedBatches}
          onFollowup={onFollowupSubagent}
          onInspect={onInspectSubagent}
          onInterrupt={onInterruptSubagent}
          embedded
        />
      ) : null}
    </div>
  )
}
