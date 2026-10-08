import { Code2 } from "lucide-react"

import type { MessageError } from "../../../types"
import { NoticeCard } from "../../feedback"

export function RawOutput({ content }: { content: string }) {
  return (
    <details className="mx-[2.05vh] mb-[0.45vh] rounded-[1.1vh] border border-border bg-bg/60 text-[1.42vh] text-text-muted">
      <summary className="flex cursor-pointer select-none items-center gap-[0.8vh] px-[1.2vh] py-[0.8vh]">
        <Code2 className="h-[1.65vh] w-[1.65vh]" />
        原始输出
      </summary>
      <pre className="max-h-[32vh] overflow-auto whitespace-pre-wrap border-t border-border px-[1.2vh] py-[0.8vh] font-mono text-[1.34vh] leading-[1.6] text-text">
        {content}
      </pre>
    </details>
  )
}

export function MessageErrorCard({ error }: { error: MessageError }) {
  return (
    <NoticeCard tone="error" title={error.title} description={error.message}
      badge={error.model ? <span className="break-all font-mono">{error.model}</span> : undefined}
      details={error.detail} detailsLabel="查看技术详情"
      className="mx-[0.45vh] my-[0.7vh] w-[calc(100%-0.9vh)] font-sans" />
  )
}
