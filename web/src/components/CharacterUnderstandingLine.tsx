import { AlertTriangle, LoaderCircle, Sparkles } from "lucide-react"
import type { OrchestratorRun } from "../types"
import { cn } from "../lib/utils"

export function CharacterUnderstandingLine({
  run,
}: {
  run?: OrchestratorRun
}) {
  if (!run) return null
  const failed = run.status === "failed"
  const active = run.status === "planning" || run.status === "running"
  const activityText = run.status === "completed"
    ? run.summary || run.phase || "已完成请求理解"
    : run.toolName
      ? `${run.phase || "正在处理"} · ${run.toolName}`
      : run.phase && run.phase !== "正在理解请求"
        ? run.phase
        : "正在理解当前请求"
  const StatusIcon = failed ? AlertTriangle : Sparkles

  return (
    <div
      role={active ? "status" : undefined}
      aria-live={active ? "polite" : undefined}
      className="my-[0.55vh] flex w-full min-w-0 items-center gap-[0.8vh] py-[0.45vh] font-sans text-[1.42vh] text-text-muted"
    >
      <StatusIcon
        className={cn(
          "h-[1.65vh] w-[1.65vh] shrink-0",
          failed ? "text-red-500" : active ? "animate-pulse text-accent" : "text-accent",
        )}
      />
      <span className={cn("shrink-0 whitespace-nowrap", failed ? "text-red-600" : "text-accent")}>
        {failed ? "理解失败" : active ? "理解中" : "理解"}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-text-muted/70", failed && "text-red-600/75")}>
        {activityText}
      </span>
      {active ? <LoaderCircle className="h-[1.45vh] w-[1.45vh] shrink-0 animate-spin text-accent" /> : null}
    </div>
  )
}
