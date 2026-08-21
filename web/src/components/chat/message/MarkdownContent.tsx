import { memo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { resolveMonAgentUrl } from "../../../lib/agent-client"
import { splitActionLines } from "../../../lib/message-actions"
import { cn } from "../../../lib/utils"

interface MarkdownContentProps {
  content: string
  imageClassName?: string
  paragraphClassName?: string
  separateActionLines?: boolean
  actionParagraphClassName?: string
}

function MarkdownContentView({
  content,
  imageClassName = "my-2 max-w-full rounded-lg border border-border object-contain",
  paragraphClassName,
  separateActionLines = false,
  actionParagraphClassName = "my-[1.2vh] italic text-text/60",
}: MarkdownContentProps) {
  const renderMarkdown = (value: string, key?: string) => (
    <ReactMarkdown
      key={key}
      remarkPlugins={[remarkGfm]}
      components={{
        img: ({ src = "", alt = "" }) => (
          <img src={resolveMonAgentUrl(src)} alt={alt} className={imageClassName} draggable={false} />
        ),
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        p: ({ children }) => <p className={cn("indent-[2em]", paragraphClassName)}>{children}</p>,
        em: ({ children }) => <em className="italic text-accent/85">{children}</em>,
        hr: () => (
          <hr
            className="my-[2.6vh] h-[3px] border-0 bg-gradient-to-r from-black/20 via-black/65 to-black/20"
            style={{
              clipPath:
                "polygon(0 38%, 38% 30%, 50% 0, 62% 30%, 100% 38%, 100% 62%, 62% 70%, 50% 100%, 38% 70%, 0 62%)",
            }}
          />
        ),
        table: ({ children }) => (
          <div className="my-[1.6vh] w-full overflow-x-auto rounded-[1.1vh] border border-border">
            <table className="m-0 w-full min-w-max border-collapse text-left text-[0.96em]">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-b border-border bg-bg/70 px-[1.1vh] py-[0.75vh] font-medium text-text">{children}</th>
        ),
        td: ({ children }) => <td className="border-t border-border px-[1.1vh] py-[0.75vh] align-top">{children}</td>,
        pre: ({ children }) => (
          <pre className="my-[1.6vh] max-w-full overflow-x-auto rounded-[1.1vh] !bg-slate-800 p-[1.5vh] font-mono text-[0.88em] leading-[1.55] !text-stone-100 [&>code]:rounded-none [&>code]:!bg-transparent [&>code]:p-0 [&>code]:text-inherit">
            {children}
          </pre>
        ),
        code: ({ children, className }) => {
          const inline = !className
          return inline ? (
            <code className="indent-0 whitespace-pre-wrap break-words rounded-[0.45vh] border border-accent/15 bg-accent/[0.055] px-[0.55vh] py-[0.16vh] font-mono text-[0.9em] text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] before:content-none after:content-none [box-decoration-break:clone] [overflow-wrap:anywhere]">
              {children}
            </code>
          ) : (
            <code className={className}>{children}</code>
          )
        },
      }}
    >
      {value}
    </ReactMarkdown>
  )

  if (!separateActionLines) return renderMarkdown(content)

  return (
    <>
      {splitActionLines(content).map((chunk, index) =>
        chunk.action ? (
          <p key={`${index}-${chunk.content}`} className={actionParagraphClassName}>
            {chunk.content}
          </p>
        ) : (
          renderMarkdown(chunk.content, `${index}-${chunk.content}`)
        ),
      )}
    </>
  )
}

// Parsing Markdown is the dominant cost when a long chat history receives an
// unrelated parent update. All inputs are primitive values, so unchanged
// messages can safely retain their rendered Markdown subtree.
export const MarkdownContent = memo(MarkdownContentView)
