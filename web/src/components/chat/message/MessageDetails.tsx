import { AlertTriangle, Code2 } from "lucide-react"

import type { MessageError } from "../../../types"

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
    <div className="mx-[0.45vh] my-[0.7vh] w-[calc(100%-0.9vh)] rounded-[1.25vh] border border-danger/30 bg-danger-dim px-[1.45vh] py-[1.2vh] font-sans text-danger">
      <div className="flex items-start gap-[0.9vh]">
        <AlertTriangle className="mt-[0.15vh] h-[1.8vh] w-[1.8vh] shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-[1vh] gap-y-[0.45vh]">
            <span className="text-[1.58vh] font-medium text-danger">{error.title}</span>
            {error.model ? (
              <span className="rounded-full border border-danger/30 bg-card/95 px-[0.75vh] py-[0.18vh] font-mono text-[1.15vh] text-danger">
                {error.model}
              </span>
            ) : null}
          </div>
          <p className="mt-[0.45vh] text-[1.4vh] leading-[1.55] text-danger/85">{error.message}</p>
          {error.detail ? (
            <details className="mt-[0.7vh] text-[1.22vh] text-danger/75">
              <summary className="cursor-pointer select-none hover:text-danger">查看技术详情</summary>
              <pre className="mt-[0.55vh] max-h-[18vh] overflow-auto whitespace-pre-wrap break-words rounded-[0.75vh] border border-danger/30 bg-bg/80 px-[0.9vh] py-[0.7vh] font-mono text-[1.15vh] leading-[1.5] text-danger/75">
                {error.detail}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  )
}
