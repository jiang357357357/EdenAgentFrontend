import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function SessionPanelDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [])
  return createPortal(<dialog ref={dialog} aria-labelledby={titleId}
    onClose={event => { if (!event.currentTarget.open && event.currentTarget.isConnected) onClose() }}
    className="fixed inset-0 m-auto max-h-[85vh] w-[min(48rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-2xl border border-border bg-card p-0 text-text shadow-2xl backdrop:bg-black/35">
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <h2 id={titleId} className="text-lg font-medium">{title}</h2>
        <button type="button" autoFocus aria-label={`关闭${title}`} onClick={() => dialog.current?.close()}
          className="rounded-md p-2 text-text-muted hover:bg-bg"><X className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 overflow-y-auto p-5 text-sm">{children}</div>
    </div>
  </dialog>, document.body)
}
