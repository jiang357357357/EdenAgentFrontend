import { useEffect, useRef, useState } from "react"
import { Trash2 } from "lucide-react"
import { clearSelfAwakeHistory } from "../../lib/agent-client"
import { getErrorMessage } from "../../lib/auth"

export function SelfAwakeDiaryClearButton({ onCleared }: { onCleared: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close() }, [open])
  async function clear() {
    if (busy) return
    setBusy(true); setError("")
    try {
      const result = await clearSelfAwakeHistory()
      setNotice(`已清空 ${result.deleted} 条自醒记录`)
      await onCleared()
      setOpen(false)
    } catch (cause) { setError(getErrorMessage(cause, "清空自醒历史失败，请重试。")) }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" onClick={() => { setError(""); setOpen(true) }} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-muted hover:text-danger" title="清空当前账号在此世界的全部自醒历史">
      <Trash2 className="h-4 w-4" />清空自醒历史
    </button>
    <span className="sr-only" role="status">{notice}</span>
    <dialog ref={dialog} onClose={() => setOpen(false)} onCancel={event => { if (busy) event.preventDefault() }} aria-labelledby="clear-diaries-title"
      className="m-auto w-[min(28rem,90vw)] rounded-xl border border-border bg-card p-6 text-text shadow-xl backdrop:bg-scrim/60">
      <h2 id="clear-diaries-title" className="text-lg font-semibold">清空全部自醒历史？</h2>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">将永久删除当前账号在此世界的全部日记和自醒执行记录，包括其他角色和未加载的记录。会话与当前唤醒计划保留，后续自醒会正常记录。</p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">取消</button>
        <button type="button" disabled={busy} onClick={() => void clear()} className="rounded-lg border border-danger/40 bg-danger-dim px-4 py-2 text-sm text-danger disabled:opacity-50">{busy ? "正在清空…" : "清空全部自醒历史"}</button>
      </div>
    </dialog>
  </>
}
