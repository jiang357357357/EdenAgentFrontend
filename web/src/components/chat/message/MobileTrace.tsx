import { useState } from "react"
import { ChevronRight, Sparkles, Wrench } from "lucide-react"
import { MarkdownBody } from "./MarkdownBody"

const toolStatusLabels = {
  running: "运行中",
  completed: "完成",
  error: "失败",
  aborted: "已中止",
} as const

export function MobileToolTrace({ name, status, input, output }: {
  name?: string; status?: keyof typeof toolStatusLabels; input?: string; output?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const resultLabel = status === "error" || status === "aborted" ? "错误信息" : "结果"
  return <details className="message-trace tool-trace" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>
      <Wrench aria-hidden="true" />
      <span className="trace-title">{name || "工具"}</span>
      {status && <span className="trace-status" data-status={status}>{toolStatusLabels[status]}</span>}
      <ChevronRight className="trace-chevron" aria-hidden="true" />
    </summary>
    {expanded && <div className="trace-body">
      {input && <div><span>参数</span><pre>{input}</pre></div>}
      {output && <div><span>{resultLabel}</span><pre>{output}</pre></div>}
      {!output && <span>{status === "running" ? "等待结果" : "无可显示的结果"}</span>}
    </div>}
  </details>
}

export function MobileThinkingTrace({ text, running }: { text: string; running: boolean }) {
  const [expanded, setExpanded] = useState(false)
  return <details className="message-trace thinking-trace" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>
      <Sparkles aria-hidden="true" />
      <span className="trace-title">思考</span>
      {running && <span className="trace-status" data-status="running">进行中</span>}
      <ChevronRight className="trace-chevron" aria-hidden="true" />
    </summary>
    {expanded && <div className="trace-body markdown"><MarkdownBody content={text} separateActionLines /></div>}
  </details>
}
