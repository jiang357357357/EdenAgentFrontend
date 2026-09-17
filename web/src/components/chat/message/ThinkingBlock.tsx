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
    <div className="chat-trace my-[0.55vh] w-full min-w-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="chat-trace-heading flex w-full min-w-0 items-center gap-[0.55em] py-[0.45em] text-left font-sans text-[1.65vh] text-text-muted transition-colors hover:text-text"
        aria-expanded={expanded}
      >
        <TraceIcon
          className={cn(
            "h-[1.1em] w-[1.1em] shrink-0",
            isError ? "text-danger" : isRuntime ? "text-info" : "text-accent",
            isStreaming && "animate-pulse",
          )}
        />
        <span className={cn("shrink-0 whitespace-nowrap", isError ? "text-danger" : isRuntime ? "text-info" : "text-accent")}>
          {displayTitle}
        </span>
        {preview ? <span className="min-w-0 flex-1 truncate text-text-muted">{preview}</span> : null}
        {isStreaming ? <span className="shrink-0 text-[0.8em] text-text-muted">进行中</span> : null}
        <ChevronRight
          className={cn("h-[1em] w-[1em] shrink-0 text-text-muted/60 transition-transform", expanded && "rotate-90")}
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
                  ? "border-danger/35 bg-card/95"
                  : isRuntime
                    ? "border-info/30 bg-card/95"
                    : "border-accent/25 bg-card/95",
              )}
            >
              <div className="chat-thinking-font prose max-w-none font-sans text-[1.48vh] leading-[1.58] text-text-muted">
                <MarkdownContent content={visibleContent} separateActionLines />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
