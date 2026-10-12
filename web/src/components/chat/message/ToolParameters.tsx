import { toolInputDisplay } from "../../../lib/tool-input-display"

export const toolTextClass = "chat-tool-text min-w-0 max-h-[48vh] max-w-full overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-[0.9vh] bg-bg/80 p-[1.2vh] font-mono"

export function ToolParameters({ input }: { input: string }) {
  const display = toolInputDisplay(input)
  return (
    <section aria-label="工具参数" className="grid min-w-0 gap-3">
      {display.kind === "fields" ? display.fields.map((field) => (
        <div key={field.name} className="grid min-w-0 gap-1.5">
          <span className="chat-tool-label font-medium text-text-muted">{field.label}</span>
          <pre className={`${toolTextClass} text-text`}>{field.text}</pre>
        </div>
      )) : <pre className={`${toolTextClass} text-text`}>{display.text}</pre>}
      {display.kind === "fields" ? (
        <details className="chat-tool-label min-w-0 text-text-muted">
          <summary className="cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-accent">原始参数（JSON）</summary>
          <pre className={`${toolTextClass} mt-2`}>{input}</pre>
        </details>
      ) : null}
    </section>
  )
}
