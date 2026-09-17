import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface SessionTitleDialogProps {
  session: { id: string; title: string }
  onSave: (id: string, title: string) => Promise<void> | void
  onClose: () => void
}

export function SessionTitleDialog({ session, onSave, onClose }: SessionTitleDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const pending = useRef(false)
  const mounted = useRef(false)
  const [title, setTitle] = useState(session.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    mounted.current = true
    const element = dialog.current!
    element.showModal()
    input.current?.focus()
    input.current?.select()
    return () => {
      mounted.current = false
      element.close()
    }
  }, [])

  const close = () => { if (!pending.current) onClose() }
  const save = async () => {
    if (pending.current) return
    const normalized = title.trim()
    if (!normalized) { setError("会话标题不能为空。"); input.current?.focus(); return }
    if (normalized === session.title) { onClose(); return }
    pending.current = true
    setSaving(true)
    setError("")
    try {
      await onSave(session.id, normalized)
      if (mounted.current) onClose()
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : "保存标题失败，请重试。")
    } finally {
      pending.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return createPortal(
    <dialog ref={dialog} aria-labelledby="session-title-heading"
      onCancel={(event) => { event.preventDefault(); close() }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-6 text-text shadow-xl backdrop:bg-scrim/50">
      <form onSubmit={(event) => { event.preventDefault(); void save() }}>
        <h2 id="session-title-heading" className="mb-5 text-lg font-semibold">编辑会话标题</h2>
        <label htmlFor="session-title-input" className="mb-2 block text-sm text-text-muted">标题</label>
        <input ref={input} id="session-title-input" value={title} maxLength={500} disabled={saving}
          aria-invalid={Boolean(error)} aria-describedby={error ? "session-title-error" : undefined}
          onChange={(event) => { setTitle(event.target.value); setError("") }}
          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50" />
        {error && <p id="session-title-error" role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={close} disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover disabled:opacity-50">取消</button>
          <button type="submit" disabled={saving || !title.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50">
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </dialog>, document.body,
  )
}
