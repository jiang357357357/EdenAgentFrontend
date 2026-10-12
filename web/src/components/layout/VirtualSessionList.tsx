import { MessageSquare, Pencil, Trash2 } from "lucide-react"
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { resolveCoreAssetUrl } from "../../lib/auth"
import { sessionListLayout, visibleSessionRows, type SessionListRow } from "../../lib/session-list-layout"
import { cn } from "../../lib/utils"
import type { Session } from "../../types"

type Props = {
  sessions: Session[]; activeId: string; resetKey: string
  onSelect(id: string): void
  onRename(session: { id: string; title: string }): void
  onDelete(id: string): Promise<void> | void
}

function SessionAvatar({ session, active }: { session: Session; active: boolean }) {
  const source = [...(session.participants ?? [])].sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .find(item => item.avatarUrl)?.avatarUrl ?? session.avatarUrl
    ?? [...session.messages].reverse().find(message => message.role === "assistant" && message.speaker?.avatarUrl)?.speaker?.avatarUrl
  const url = resolveCoreAssetUrl(source)
  const [failed, setFailed] = useState<string | null>(null)
  return <span className="relative flex h-[4.2vh] w-[4.2vh] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card">
    {url && url !== failed ? <img src={url} alt="" className="h-full w-full object-cover object-top" loading="lazy" onError={() => setFailed(url)} />
      : <MessageSquare className={cn("h-[2.6vh] min-h-4 w-[2.6vh] min-w-4", active && "text-accent")} />}
  </span>
}

const SessionRow = memo(function SessionRow({ row, total, active, onSelect, onRename, onDelete }: {
  row: SessionListRow & { session: Session }; total: number; active: boolean
} & Pick<Props, "onSelect" | "onRename" | "onDelete">) {
  const session = row.session
  return <li data-session-row={session.id} aria-posinset={row.position} aria-setsize={total}
    className="group absolute left-0 w-full focus-within:z-10" style={{ top: row.offset, height: row.height - 4 }}>
    <button type="button" data-session-select={session.id} onClick={() => onSelect(session.id)} title={session.title}
      aria-label={`打开会话：${session.title}`} aria-current={active ? "page" : undefined}
      className={cn("flex h-full w-full items-center gap-[0.8vw] rounded-[0.9vh] border-l-2 px-[0.75vw] pr-[4.6vw] text-left text-[1.7vh] transition-colors",
        active ? "border-accent bg-accent/8 text-text" : "border-transparent text-text-muted hover:bg-card hover:text-text")}>
      <SessionAvatar session={session} active={active} />
      <span className="min-w-0 flex-1 truncate">{session.title}</span>
      <span className="shrink-0 text-[1.35vh] text-text-lighter">{session.date}</span>
    </button>
    <button type="button" onClick={() => onRename({ id: session.id, title: session.title })}
      className="absolute right-[2.55vw] top-1/2 flex h-[4.2vh] w-[4.2vh] -translate-y-1/2 items-center justify-center rounded-[0.6vh] text-text-muted opacity-0 hover:bg-accent/10 hover:text-accent focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
      aria-label={`重命名会话：${session.title}`} title="重命名会话"><Pencil className="h-[2vh] w-[2vh]" /></button>
    <button type="button" onClick={() => {
      if (window.confirm(`移除会话“${session.title}”？会立即从列表隐藏；若任务仍在运行，将同时请求停止。`)) void onDelete(session.id)
    }} className="absolute right-[0.35vw] top-1/2 flex h-[4.2vh] w-[4.2vh] -translate-y-1/2 items-center justify-center rounded-[0.6vh] text-text-muted opacity-0 hover:bg-danger/10 hover:text-danger focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
      aria-label={`强制移除会话：${session.title}`} title="强制移除会话"><Trash2 className="h-[2vh] w-[2vh]" /></button>
  </li>
})

export function VirtualSessionList({ sessions, activeId, resetKey, onSelect, onRename, onDelete }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string | undefined>(undefined)
  const [focused, setFocused] = useState<string>()
  const [viewport, setViewport] = useState({ top: 0, height: 600, screen: typeof window === "undefined" ? 800 : window.innerHeight })
  const measure = useCallback(() => {
    const element = container.current
    if (!element) return
    const next = { top: element.scrollTop, height: element.clientHeight || window.innerHeight, screen: window.innerHeight }
    setViewport(previous => previous.top === next.top && previous.height === next.height && previous.screen === next.screen ? previous : next)
  }, [])
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener("resize", measure)
    return () => { observer.disconnect(); window.removeEventListener("resize", measure) }
  }, [measure])
  const layout = useMemo(() => sessionListLayout(sessions, viewport.screen), [sessions, viewport.screen])
  const top = Math.min(viewport.top, Math.max(0, layout.height - viewport.height))
  const visible = visibleSessionRows(layout.rows, top, viewport.height)
  const focusedRow = focused ? layout.rows.find(row => row.key === focused) : undefined
  if (focusedRow && !visible.includes(focusedRow)) visible.push(focusedRow)

  useLayoutEffect(() => {
    if (!container.current) return
    container.current.scrollTop = 0
    measure()
  }, [resetKey, measure])
  useLayoutEffect(() => {
    if (!container.current || container.current.scrollTop === top) return
    container.current.scrollTop = top
    measure()
  }, [top, measure])
  useEffect(() => {
    const row = layout.rows.find(item => item.key === activeId)
    const element = container.current
    if (!row || !element) return
    if (row.offset < element.scrollTop || row.offset + row.height > element.scrollTop + element.clientHeight) {
      element.scrollTop = row.offset
      measure()
    }
    // Selecting a different session reveals it; ordinary stream updates never move the sidebar.
  }, [activeId, measure])
  useLayoutEffect(() => {
    const id = pendingFocus.current
    if (!id) return
    const target = container.current?.querySelector<HTMLButtonElement>(`button[data-session-select="${CSS.escape(id)}"]`)
    if (target) { pendingFocus.current = undefined; target.focus({ preventScroll: true }) }
  }, [viewport, sessions])
  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const id = target.closest<HTMLElement>("[data-session-row]")?.dataset.sessionRow
    if (!id || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    const index = sessions.findIndex(session => session.id === id)
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? sessions.length - 1
      : Math.max(0, Math.min(sessions.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))
    const next = sessions[nextIndex]
    const row = layout.rows.find(item => item.key === next?.id)
    if (!next || !row || !container.current) return
    event.preventDefault()
    pendingFocus.current = next.id
    container.current.scrollTop = row.offset
    measure()
  }
  return <div ref={container} data-virtual-session-list className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
    onKeyDown={moveFocus} onFocusCapture={event => setFocused((event.target as HTMLElement).closest<HTMLElement>("[data-session-row]")?.dataset.sessionRow)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(undefined) }}
    onScroll={measure}>
    {sessions.length ? <ul aria-label="会话列表" className="relative" style={{ height: layout.height }}>
      {visible.map(row => row.session
        ? <SessionRow key={row.key} row={row as SessionListRow & { session: Session }} total={sessions.length}
          active={row.session.id === activeId} onSelect={onSelect} onRename={onRename} onDelete={onDelete} />
        : <li key={row.key} role="presentation" className="absolute left-0 w-full" style={{ top: row.offset, height: row.height }}>
          <h2 className="px-2 pb-1 pt-2 text-[1.2vh] font-medium text-text-muted">{row.label}</h2></li>)}
    </ul> : <div className="px-4 py-10 text-center text-sm text-text-muted">没有匹配的会话</div>}
  </div>
}
