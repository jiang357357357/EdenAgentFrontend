import { useState } from "react"
import { ChevronRight, FileDiff } from "lucide-react"
import type { RunReview } from "../../../lib/run-review"
import { cn } from "../../../lib/utils"

export function RunReviewCard({ review }: { review: RunReview }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <section className="mx-auto my-[1.2vh] w-[min(82%,96vh)] overflow-hidden rounded-[1.2vh] border border-border bg-card shadow-sm">
      <button
        type="button"
        className="flex w-full items-center gap-[0.9vh] px-[1.2vh] py-[0.95vh] text-left hover:bg-accent/5"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <FileDiff className="h-[1.8vh] w-[1.8vh] shrink-0 text-accent" />
        <span className="font-medium text-[1.45vh] text-text">本轮 Review</span>
        <span className="min-w-0 flex-1 truncate text-[1.25vh] text-text-muted">
          {review.files.length} 个文件 · {review.snapshot ? "最终工作区快照" : "本轮操作汇总"}
        </span>
        <span className="font-mono text-[1.25vh] text-success">+{review.additions}</span>
        <span className="font-mono text-[1.25vh] text-danger">-{review.deletions}</span>
        <ChevronRight className={cn("h-[1.6vh] w-[1.6vh] text-text-muted transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded ? (
        <div className="grid gap-[0.8vh] border-t border-border bg-accent/[0.025] p-[1vh]">
          {review.files.map((file) => (
            <details key={file.movePath || file.path} className="overflow-hidden rounded-[0.9vh] border border-border/80 bg-bg/75">
              <summary className="flex cursor-pointer list-none items-center gap-[0.75vh] px-[1vh] py-[0.75vh] text-[1.25vh]">
                <span className="min-w-0 flex-1 truncate font-mono text-text">{file.movePath ? `${file.path} → ${file.movePath}` : file.path}</span>
                {file.patches.length > 1 ? <span className="text-text-muted">{file.patches.length} 次变更</span> : null}
                <span className="font-mono text-success">+{file.additions}</span>
                <span className="font-mono text-danger">-{file.deletions}</span>
              </summary>
              {file.patches.map((entry, patchIndex) => (
                <div key={`${entry.toolID}:${patchIndex}`} className="border-t border-border/70">
                  {file.patches.length > 1 ? <div className="px-[1vh] py-[0.45vh] text-[1.1vh] text-text-muted">第 {patchIndex + 1} 次变更</div> : null}
                  <pre className="max-h-[45vh] overflow-auto whitespace-pre font-mono text-[1.15vh] leading-[1.55] text-text-muted">
                    {entry.patch.split("\n").map((line, lineIndex) => (
                      <span key={lineIndex} className={cn(
                        "block min-w-max px-[1vh]",
                        line.startsWith("+") && !line.startsWith("+++") && "bg-success-dim text-success",
                        line.startsWith("-") && !line.startsWith("---") && "bg-danger-dim text-danger",
                        line.startsWith("@@") && "bg-info-dim text-info",
                      )}>{line || " "}</span>
                    ))}
                  </pre>
                </div>
              ))}
            </details>
          ))}
        </div>
      ) : null}
    </section>
  )
}
