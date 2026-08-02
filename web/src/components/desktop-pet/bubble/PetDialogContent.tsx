import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { splitActionLines } from "../../../lib/message-actions"
import type { PetDialogSegment } from "../../../lib/pet-dialog-segments"
import type { ToolCall } from "../../../types"

export function segmentText(segment: PetDialogSegment) {
  if (segment.text) return segment.text
  if (segment.runtimeTrace) return segment.runtimeTrace
  if (segment.thinking) return segment.thinking
  if (segment.tool) return `${segment.tool.name} · ${segment.tool.status}`
  return ""
}

export function toolStatus(status: ToolCall["status"]) {
  if (status === "running") return "运行中"
  if (status === "success") return "完成"
  if (status === "error") return "失败"
  return status || "等待"
}

function PetMarkdownBlock({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        p: ({ children }) => <p className="m-0 whitespace-pre-wrap leading-[1.4]">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-stone-50">{children}</strong>,
        em: ({ children }) => <em className="italic text-amber-300/85">{children}</em>,
        h1: ({ children }) => <h1 className="mb-[1.5cqh] mt-0 text-[1.18em] font-semibold text-stone-50">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-[1.25cqh] mt-0 text-[1.1em] font-semibold text-stone-50">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-[1cqh] mt-0 font-semibold text-stone-50">{children}</h3>,
        ul: ({ children }) => <ul className="my-[1cqh] list-disc space-y-[0.4cqh] pl-[5cqh]">{children}</ul>,
        ol: ({ children }) => <ol className="my-[1cqh] list-decimal space-y-[0.4cqh] pl-[5cqh]">{children}</ol>,
        li: ({ children }) => <li className="pl-[0.5cqh] leading-[1.4] marker:text-stone-500">{children}</li>,
        blockquote: ({ children }) => <blockquote className="my-[1cqh] border-l-2 border-orange-500/55 pl-[3cqh] text-stone-300">{children}</blockquote>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-orange-300 underline decoration-orange-400/45 underline-offset-2">{children}</a>,
        code: ({ children, className }) => className ? <code className={className}>{children}</code> : <code className="rounded-[1cqh] bg-white/8 px-[1.2cqh] py-[0.25cqh] font-mono text-[0.9em] text-orange-100">{children}</code>,
        pre: ({ children }) => <pre className="my-[1.5cqh] max-w-full overflow-x-auto rounded-[2cqh] bg-black/25 p-[3cqh] font-mono text-[0.86em] leading-[1.45] text-stone-200">{children}</pre>,
        hr: () => <hr className="my-[2cqh] border-white/10" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export function DesktopPetMarkdown({ content }: { content: string }) {
  const chunks = splitActionLines(content)
  return (
    <div className="grid min-w-0 gap-[1.2cqh] [overflow-wrap:anywhere]">
      {chunks.map((chunk, index) => chunk.action ? (
        <p key={`${index}-${chunk.content}`} className="m-0 whitespace-pre-wrap italic leading-[1.4] text-stone-400">
          {chunk.content}
        </p>
      ) : (
        <div key={`${index}-${chunk.content}`} className="min-w-0">
          <PetMarkdownBlock content={chunk.content} />
        </div>
      ))}
    </div>
  )
}
