import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { resolveMonAgentUrl } from "../lib/mon_agent_api"

interface MarkdownContentProps {
  content: string
  imageClassName?: string
  paragraphClassName?: string
  separateActionLines?: boolean
  actionParagraphClassName?: string
}

function isActionDescription(text: string) {
  return /^\s*(?:（[\s\S]*）|\([\s\S]*\))\s*$/.test(text)
}

function splitActionLines(content: string) {
  const chunks: Array<{ action: boolean; content: string }> = []
  let regularLines: string[] = []
  const flushRegularLines = () => {
    const value = regularLines.join("\n").trim()
    if (value) chunks.push({ action: false, content: value })
    regularLines = []
  }

  for (const line of content.split("\n")) {
    if (isActionDescription(line)) {
      flushRegularLines()
      chunks.push({ action: true, content: line.trim() })
    } else {
      regularLines.push(line)
    }
  }
  flushRegularLines()
  return chunks
}

export function MarkdownContent({
  content,
  imageClassName = "my-2 max-w-full rounded-lg border border-border object-contain",
  paragraphClassName,
  separateActionLines = false,
  actionParagraphClassName = "my-[1.2vh] italic text-text-muted",
}: MarkdownContentProps) {
  const renderMarkdown = (value: string, key?: string) => (
    <ReactMarkdown
      key={key}
      remarkPlugins={[remarkGfm]}
      components={{
        img: ({ src = "", alt = "" }) => (
          <img src={resolveMonAgentUrl(src)} alt={alt} className={imageClassName} draggable={false} />
        ),
        p: ({ children }) => <p className={paragraphClassName}>{children}</p>,
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
            <code className="rounded-[0.45vh] bg-bg px-[0.55vh] py-[0.18vh] font-mono text-[0.9em]">{children}</code>
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
      {splitActionLines(content).map((chunk, index) => chunk.action ? (
        <p key={`${index}-${chunk.content}`} className={actionParagraphClassName}>
          {chunk.content}
        </p>
      ) : renderMarkdown(chunk.content, `${index}-${chunk.content}`))}
    </>
  )
}
