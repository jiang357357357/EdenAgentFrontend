import { resolveMonAgentUrl } from "../../../lib/agent-client"
import { cn } from "../../../lib/utils"
import { MarkdownContent } from "../message/MarkdownContent"
import type { DialogSegment } from "./types"

interface ChatDialogPanelProps {
  assistantName: string
  currentOutput?: DialogSegment
  fontRatio: number
  onAdvance: () => void
  onPreviewImage?: (src: string, alt?: string) => void
  standaloneOverlay: boolean
}

export function ChatDialogPanel({
  assistantName,
  currentOutput,
  fontRatio,
  onAdvance,
  onPreviewImage,
  standaloneOverlay,
}: ChatDialogPanelProps) {
  return (
    <div
      onClick={onAdvance}
      className={cn(
        "absolute inset-0 box-border h-full w-full cursor-pointer overflow-y-auto overflow-x-hidden text-left leading-relaxed text-stone-100 [overflow-wrap:anywhere] [&::-webkit-scrollbar]:hidden",
        standaloneOverlay ? "px-[8cqh] pb-[8cqh] pt-[8cqh]" : "px-[2.8vh] pb-[8.2vh] pt-[2.7vh]",
      )}
      style={{ fontSize: standaloneOverlay ? `${10.5 * fontRatio}cqh` : `${1.72 * fontRatio}vh` }}
    >
      {currentOutput ? (
        <div>
          {currentOutput.runtimeTrace && (
            <details className="mb-3 rounded-lg border border-teal-200/15 bg-teal-300/10 px-3 py-2" onClick={(event) => event.stopPropagation()}>
              <summary className="cursor-pointer select-none text-[0.8em] tracking-[0.14em] text-teal-100/85">运行过程</summary>
              <div className="mt-2 whitespace-pre-wrap text-[0.95em] text-stone-200 [overflow-wrap:anywhere]">{currentOutput.runtimeTrace}</div>
            </details>
          )}
          {currentOutput.thinking && (
            <details className="mb-3 rounded-lg border border-sky-200/15 bg-sky-300/10 px-3 py-2" onClick={(event) => event.stopPropagation()}>
              <summary className="cursor-pointer select-none text-[0.8em] tracking-[0.14em] text-sky-100/85">思考</summary>
              <div className="mt-2 whitespace-pre-wrap text-[0.95em] text-stone-200 [overflow-wrap:anywhere]">{currentOutput.thinking}</div>
            </details>
          )}
          {currentOutput.tool && (
            <details className="mb-3 rounded-lg border border-emerald-200/15 bg-emerald-300/10 px-3 py-2" onClick={(event) => event.stopPropagation()}>
              <summary className="cursor-pointer select-none text-[0.8em] tracking-[0.14em] text-emerald-100/85">工具: {currentOutput.tool.name}</summary>
              <div className="mt-2 grid gap-2 text-[0.88em] text-stone-200">
                <div>状态: {currentOutput.tool.status}{currentOutput.tool.duration ? ` · ${currentOutput.tool.duration}ms` : ""}</div>
                <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-2 [overflow-wrap:anywhere]">{currentOutput.tool.input}</pre>
                {currentOutput.tool.output && (
                  <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-2 [overflow-wrap:anywhere]">{currentOutput.tool.output}</pre>
                )}
                {currentOutput.tool.error && (
                  <pre className="whitespace-pre-wrap rounded-lg border border-red-300/20 bg-red-950/30 p-2 text-red-100 [overflow-wrap:anywhere]">{currentOutput.tool.error}</pre>
                )}
              </div>
            </details>
          )}
          {currentOutput.text && (
            <MarkdownContent
              content={currentOutput.text}
              separateActionLines
              imageClassName="my-2 max-h-32 max-w-full rounded-lg border border-white/10 object-contain"
              paragraphClassName="mb-3 last:mb-0"
            />
          )}
          {currentOutput.images && currentOutput.images.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {currentOutput.images.map((image, index) => {
                const src = resolveMonAgentUrl(image)
                return (
                  <img
                    key={`${image}-${index}`}
                    src={src}
                    alt="会话图片"
                    onClick={(event) => {
                      event.stopPropagation()
                      onPreviewImage?.(src, "会话图片")
                    }}
                    className="max-h-32 max-w-full cursor-pointer rounded-lg border border-white/10 object-contain transition-opacity hover:opacity-85"
                  />
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <span className="text-stone-300">{assistantName}正在回复…</span>
      )}
    </div>
  )
}
