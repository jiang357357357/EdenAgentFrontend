import type { ToolCommandDisplay } from "../../../lib/tool-command-display"
import { cn } from "../../../lib/utils"
import { NoticeCard } from "../../feedback"
import { toolTextClass } from "./ToolParameters"

export function ToolCommandOutput({ command }: { command: ToolCommandDisplay }) {
  const truncatedDescription = command.captured_chars === undefined
    ? "输出超过捕获上限，后续内容未显示。"
    : `输出超过捕获上限，当前显示 ${command.captured_chars} 个字符。`
  return (
    <section aria-label="命令结果" className="grid min-w-0 gap-[1vh]">
      {command.stdout ? (
        <section aria-label="标准输出" className="grid min-w-0 gap-[0.4vh]">
          <span className="chat-tool-label font-medium text-text-muted">标准输出（stdout）</span>
          <pre className={`${toolTextClass} text-text`}>{command.stdout}</pre>
        </section>
      ) : null}
      {command.stderr ? (
        <section aria-label="标准错误" className="grid min-w-0 gap-[0.4vh]">
          <span className="chat-tool-label font-medium text-danger">标准错误（stderr）</span>
          <pre className={cn(toolTextClass, "border border-danger/30 bg-danger-dim text-danger")}>{command.stderr}</pre>
        </section>
      ) : null}
      {!command.stdout && !command.stderr && command.exit_code !== undefined ? (
        <p className="chat-tool-label text-text-muted">无输出</p>
      ) : null}
      {command.truncated ? <NoticeCard tone="warning" title="输出已截断" description={truncatedDescription} /> : null}
      {command.rawOutput ? (
        <details className="min-w-0">
          <summary className="chat-tool-label cursor-pointer text-text-muted">原始结果（JSON）</summary>
          <pre className={`${toolTextClass} mt-[0.6vh] text-text-muted`}>{command.rawOutput}</pre>
        </details>
      ) : null}
    </section>
  )
}
