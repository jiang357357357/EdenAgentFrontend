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

type CommandDetails = {
  command?: string
  cwd?: string
  session_id?: string
  status?: string
  exit_code?: number | null
  stdout?: string
  stderr?: string
  duration_ms?: number
  truncated?: boolean
  captured_chars?: number
}

type WorkspaceDiffDetails = {
  kind: "workspace_diff"
  files: Array<{
    path: string
    status?: string
    movePath?: string | null
    additions?: number
    deletions?: number
    patch?: string
  }>
}

function commandDetails(tool: ToolCall): CommandDetails | undefined {
  if (tool.name !== "bash" && tool.name !== "write_stdin") return undefined
  if (!tool.details || typeof tool.details !== "object" || Array.isArray(tool.details)) return undefined
  return tool.details as CommandDetails
}

function workspaceDiffDetails(tool: ToolCall): WorkspaceDiffDetails | undefined {
  if (!tool.details || typeof tool.details !== "object" || Array.isArray(tool.details)) return undefined
  const details = tool.details as Partial<WorkspaceDiffDetails>
  return details.kind === "workspace_diff" && Array.isArray(details.files) ? details as WorkspaceDiffDetails : undefined
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
  const command = commandDetails(tool)
  const workspaceDiff = workspaceDiffDetails(tool)
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
                {command?.exit_code !== undefined && command.exit_code !== null ? <span>退出码：{command.exit_code}</span> : null}
                {command?.duration_ms !== undefined ? <span>耗时：{command.duration_ms}ms</span> : null}
                {tool.errorCode ? <span>错误码：{tool.errorCode}</span> : null}
                {typeof tool.retryable === "boolean" ? <span>{tool.retryable ? "可以重试" : "不建议原样重试"}</span> : null}
              </div>
              {command?.command ? (
                <div className="grid gap-[0.35vh] rounded-[0.9vh] border border-border/70 bg-bg/75 px-[1vh] py-[0.8vh] font-mono text-[1.24vh]">
                  <div className="break-all text-text"><span className="select-none text-text-muted">$ </span>{command.command}</div>
                  {command.cwd ? <div className="break-all text-text-muted">cwd: {command.cwd}</div> : null}
                  {command.session_id && command.status === "running" ? <div className="break-all text-violet-600">session: {command.session_id}</div> : null}
                </div>
              ) : null}
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
              {command?.stdout ? (
                <div className="grid gap-[0.4vh]">
                  <span className="text-[1.18vh] font-medium uppercase tracking-wide text-text-muted">stdout</span>
                  <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-[0.9vh] bg-bg/80 p-[0.9vh] font-mono text-[1.28vh] leading-[1.5] text-text-muted">{command.stdout}</pre>
                </div>
              ) : null}
              {command?.stderr ? (
                <div className="grid gap-[0.4vh]">
                  <span className="text-[1.18vh] font-medium uppercase tracking-wide text-red-500">stderr</span>
                  <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-[0.9vh] border border-red-200/60 bg-red-50/65 p-[0.9vh] font-mono text-[1.28vh] leading-[1.5] text-red-600">{command.stderr}</pre>
                </div>
              ) : null}
              {command?.truncated ? (
                <div className="rounded-[0.8vh] border border-amber-200 bg-amber-50 px-[0.9vh] py-[0.65vh] text-[1.22vh] text-amber-700">
                  输出超过捕获上限，当前显示 {command.captured_chars ?? 0} 个字符。
                </div>
              ) : null}
              {workspaceDiff ? (
                <div className="grid gap-[0.75vh]">
                  {workspaceDiff.files.map((file, index) => (
                    <section key={`${file.path}:${index}`} className="overflow-hidden rounded-[0.9vh] border border-border/80 bg-bg/75">
                      <header className="flex min-w-0 items-center gap-[0.8vh] border-b border-border/70 px-[1vh] py-[0.7vh] text-[1.23vh]">
                        <span className="min-w-0 flex-1 truncate font-mono text-text">{file.movePath ? `${file.path} → ${file.movePath}` : file.path}</span>
                        {file.status ? <span className="shrink-0 text-text-muted">{file.status}</span> : null}
                        <span className="shrink-0 font-mono text-emerald-600">+{file.additions ?? 0}</span>
                        <span className="shrink-0 font-mono text-red-500">-{file.deletions ?? 0}</span>
                      </header>
                      {file.patch ? (
                        <pre className="max-h-[42vh] max-w-full overflow-auto whitespace-pre font-mono text-[1.18vh] leading-[1.55] text-text-muted">
                          {file.patch.split("\n").map((line, lineIndex) => (
                            <span
                              key={lineIndex}
                              className={cn(
                                "block min-w-max px-[1vh]",
                                line.startsWith("+") && !line.startsWith("+++") && "bg-emerald-50 text-emerald-800",
                                line.startsWith("-") && !line.startsWith("---") && "bg-red-50 text-red-700",
                                line.startsWith("@@") && "bg-sky-50 text-sky-700",
                              )}
                            >
                              {line || " "}
                            </span>
                          ))}
                        </pre>
                      ) : null}
                    </section>
                  ))}
                </div>
              ) : null}
              {tool.output && !command && !workspaceDiff ? (
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
