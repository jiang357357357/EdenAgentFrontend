import { memo, useMemo, useState } from "react"
import { toolDataDisplay, toolFieldLabel, type ToolDataValue } from "../../../lib/tool-data-display"

export const toolTextClass = "chat-tool-text min-w-0 max-h-[48vh] max-w-full overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-[0.9vh] bg-bg/80 p-[1.2vh] font-mono"
export type ToolDataVariant = "chat" | "dialog" | "pet"
const styles = {
  chat: { text: `${toolTextClass} text-text`, label: "chat-tool-label font-medium text-text-muted" },
  dialog: { text: "min-w-0 max-w-full max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-highlight/10 bg-scrim/20 p-2 font-mono [overflow-wrap:anywhere]", label: "text-[0.88em] text-text-muted" },
  pet: { text: "min-w-0 max-w-full max-h-[65cqh] overflow-auto whitespace-pre-wrap rounded-[2cqh] bg-scrim/20 p-[2.5cqh] font-mono [overflow-wrap:anywhere]", label: "text-[0.88em] text-text-muted" },
} satisfies Record<ToolDataVariant, { text: string; label: string }>

function ToolValue({ value, label, depth, variant }: {
  value: ToolDataValue; label?: string; depth: number; variant: ToolDataVariant
}) {
  const collection = value !== null && typeof value === "object"
  const entries = collection ? Object.entries(value) : []
  const [expanded, setExpanded] = useState(depth < 2 && entries.length <= 12)
  const [visibleCount, setVisibleCount] = useState(50)
  if (!collection || !entries.length) {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
    return <div className="grid min-w-0 gap-1.5">
      {label ? <span className={styles[variant].label}>{label}</span> : null}
      <pre className={styles[variant].text}>{text}</pre>
    </div>
  }
  const children = () => <div className="grid min-w-0 gap-3">
    {entries.slice(0, visibleCount).map(([name, child]) => <ToolValue key={name} value={child} depth={depth + 1} variant={variant}
      label={Array.isArray(value) ? `第 ${Number(name) + 1} 项` : toolFieldLabel(name)} />)}
    {entries.length > visibleCount ? <button type="button"
      className={`${styles[variant].label} rounded border border-border px-3 py-2 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent`}
      onClick={() => setVisibleCount(count => count + 50)}>
      显示更多（还有 {entries.length - visibleCount} 项）
    </button> : null}
  </div>
  if (depth === 0 && entries.length <= 12) return children()
  return <details className="min-w-0" open={expanded}
    onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary className={`${styles[variant].label} cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-accent`}>
      {label ?? (Array.isArray(value) ? "列表" : "字段")} · {entries.length} 项
    </summary>
    {expanded ? <div className="mt-2 min-w-0 border-l border-border/60 pl-3">{children()}</div> : null}
  </details>
}

export const ToolDataView = memo(function ToolDataView({ text, kind, variant = "chat" }: {
  text: string; kind: "input" | "output"; variant?: ToolDataVariant
}) {
  const display = useMemo(() => toolDataDisplay(text), [text])
  const value = display.parsed === false ? display.text : display.value
  return <section aria-label={kind === "input" ? "工具参数" : "工具结果"} className="grid min-w-0 gap-3">
    <ToolValue key={text} value={value} depth={0} variant={variant} />
    {display.parsed ? <details className="min-w-0">
      <summary className={`${styles[variant].label} cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-accent`}>
        {kind === "input" ? "原始参数（JSON）" : "原始结果（JSON）"}
      </summary>
      <pre className={`${styles[variant].text} mt-2`}>{text}</pre>
    </details> : null}
  </section>
})
