import { Clock3 } from "lucide-react"
import { formatReplyDuration } from "../../../lib/reply-duration"
import { cn } from "../../../lib/utils"

export function ReplyDuration({ durationMs, className }: { durationMs?: number; className?: string }) {
  const duration = formatReplyDuration(durationMs)
  if (!duration) return null

  return (
    <div className={cn("flex items-center gap-[0.55vh] font-sans text-[1.42vh] text-text-muted tabular-nums", className ?? "mx-[2.05vh] mt-[0.4vh]")}>
      <Clock3 className="h-[1.55vh] w-[1.55vh] shrink-0" aria-hidden="true" />
      <span>耗时 {duration}</span>
    </div>
  )
}
