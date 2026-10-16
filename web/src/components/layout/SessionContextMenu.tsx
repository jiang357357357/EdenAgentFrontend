import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface Props {
  session: { id: string; title: string; archived?: boolean }
  x: number; y: number; anchor: HTMLElement
  onEdit(): void
  onArchive(): Promise<void> | void
  onDelete(): Promise<void> | void
  onClose(): void
}

export function SessionContextMenu({ session, x, y, anchor, onEdit, onArchive, onDelete, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const live = useRef(false)
  const [position, setPosition] = useState({ left: x, top: y })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useLayoutEffect(() => {
    const menu = panel.current!
    setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8)) })
    menu.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true })
  }, [x, y, error])
  useEffect(() => {
    live.current = true
    const outside = (event: Event) => { if (!panel.current?.contains(event.target as Node)) onClose() }
    const resize = () => onClose()
    document.addEventListener("pointerdown", outside, true)
    window.addEventListener("scroll", outside, true)
    window.addEventListener("resize", resize)
    return () => {
      live.current = false
      document.removeEventListener("pointerdown", outside, true)
      window.removeEventListener("scroll", outside, true)
      window.removeEventListener("resize", resize)
      if (anchor.isConnected) anchor.focus({ preventScroll: true })
    }
  }, [anchor, onClose])
  const action = async (run: () => Promise<void> | void) => {
    if (busy) return
    setBusy(true); setError("")
    try { await run(); if (live.current) onClose() }
    catch (reason) { if (live.current) setError(reason instanceof Error ? reason.message : "会话操作失败，请重试。") }
    finally { if (live.current) setBusy(false) }
  }
  const keys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); onClose(); return }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(panel.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
    items[index]?.focus()
  }
  const itemClass = "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-accent/10 focus:bg-accent/10 disabled:opacity-50"
  const ArchiveIcon = session.archived ? ArchiveRestore : Archive
  return createPortal(<div ref={panel} role="menu" aria-label={`会话操作：${session.title}`} aria-busy={busy}
    onKeyDown={keys} onContextMenu={event => event.preventDefault()}
    className="fixed z-[100] w-44 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border bg-card p-1 text-text shadow-xl"
    style={{ ...position, maxHeight: "calc(100vh - 1rem)" }}>
    <button type="button" role="menuitem" disabled={busy} className={itemClass}
      onClick={() => { onClose(); onEdit() }}><Pencil className="h-4 w-4" />编辑</button>
    <button type="button" role="menuitem" disabled={busy} className={itemClass}
      onClick={() => void action(onArchive)}><ArchiveIcon className="h-4 w-4" />{session.archived ? "取消归档" : "归档"}</button>
    <button type="button" role="menuitem" disabled={busy} className={`${itemClass} text-danger`}
      onClick={() => void action(onDelete)}><Trash2 className="h-4 w-4" />删除</button>
    {error && <p role="alert" className="px-3 py-2 text-xs text-danger">{error}</p>}
  </div>, document.body)
}
