import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Activity, AlertTriangle, ChevronRight, Sparkles } from "lucide-react"
import { MarkdownContent } from "./MarkdownContent"
import { useTypewriterText } from "../../../hooks/useTypewriterText"
import { cn } from "../../../lib/utils"

interface ThinkingBlockProps {
  content: string
  state?: "streaming" | "done"
  title?: string
  activeTitle?: string
  cacheKey?: string
  onTextReveal?: () => void
  error?: string
}

export function ThinkingBlock({
  content,
  state = "done",
  title = "思考",
  activeTitle,
  cacheKey,
  onTextReveal,
  error,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const isStreaming = state === "streaming"
  const isRuntime = title === "运行过程"
  const isError = Boolean(error)
  const visibleContent = useTypewriterText({
    active: isStreaming,
    cacheKey: cacheKey ?? `${title}:${content.slice(0, 48)}`,
    target: content,
    onFrame: onTextReveal,
  })
  const preview = error || visibleContent.replace(/\s+/g, " ").trim()
  const displayTitle = isError ? "运行失败" : isStreaming ? (activeTitle ?? title) : title
  const TraceIcon = isError ? AlertTriangle : isRuntime ? Activity : Sparkles

  return (
    <div className="my-[0.55vh] w-full min-w-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full min-w-0 items-center gap-[0.8vh] py-[0.45vh] text-left font-sans text-[1.42vh] text-text-muted transition-colors hover:text-text"
        aria-expanded={expanded}
      >
        <TraceIcon
          className={cn(
            "h-[1.65vh] w-[1.65vh] shrink-0",
            isError ? "text-red-500" : isRuntime ? "text-sky-500" : "text-accent",
            isStreaming && "animate-pulse",
          )}
        />
        <span className={cn("shrink-0 whitespace-nowrap", isError ? "text-red-600" : isRuntime ? "text-sky-600" : "text-accent")}>
          {displayTitle}
        </span>
        {preview ? <span className="min-w-0 flex-1 truncate text-text-muted/70">{preview}</span> : null}
        {isStreaming ? <span className="shrink-0 text-[1.2vh] text-text-muted/60">进行中</span> : null}
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
            <div
              className={cn(
                "mt-[0.55vh] rounded-[1.1vh] border px-[1.35vh] py-[1.05vh]",
                isError
                  ? "border-red-200/70 bg-red-50/55"
                  : isRuntime
                    ? "border-sky-200/60 bg-sky-50/45"
                    : "border-orange-200/60 bg-orange-50/35",
              )}
            >
              <div className="prose max-w-none font-sans text-[1.48vh] leading-[1.58] text-text-muted">
                <MarkdownContent content={visibleContent} separateActionLines />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
