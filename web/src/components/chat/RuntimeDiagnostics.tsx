import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Activity, X } from 'lucide-react'
import { MonSyncPanel } from './MonSyncPanel'
import { OperationPanel } from './OperationPanel'
import { McpPanel } from './McpPanel'
import { useRuntimeOrigin } from '../../lib/use-runtime-origin'
import type { Session } from '../../types'

type DiagnosticSession = Pick<Session, 'id' | 'title'>
export function RuntimeDiagnostics({ sessions, activeSessionId, iconOnly = false }: { sessions: DiagnosticSession[]; activeSessionId?: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false)
  const origin = useRuntimeOrigin()
  return <div className={iconOnly ? "shrink-0" : "flex items-center justify-between gap-4 border-b border-border px-2 py-5"}>
    {!iconOnly && <div><h3 className="text-sm font-medium">运行诊断</h3>
      <p className="mt-1 text-xs text-text-muted">查看会话同步、工具执行和外部工具连接记录。</p></div>}
    <button type="button" onClick={() => setOpen(true)} aria-label="打开运行诊断" title="运行诊断" aria-haspopup="dialog"
      className={iconOnly ? "flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-card hover:text-text" : "flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-card"}>
      <Activity className="h-4 w-4" />{!iconOnly && "打开窗口"}
    </button>
    {open && createPortal(<DiagnosticsDialog key={origin} sessions={sessions} initialSessionId={activeSessionId} onClose={() => setOpen(false)} />, document.body)}
  </div>
}

function DiagnosticsDialog({ sessions, initialSessionId, onClose }: { sessions: DiagnosticSession[]; initialSessionId?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState(initialSessionId ?? sessions[0]?.id ?? '')
  const sessionId = sessions.some(item => item.id === selected) ? selected : sessions[0]?.id ?? ''
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [])
  return <dialog ref={dialog} aria-labelledby="runtime-diagnostics-title" onClose={event => { if (!event.currentTarget.open && event.currentTarget.isConnected) onClose() }}
    className="fixed inset-0 m-auto max-h-[85vh] w-[min(48rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-2xl border border-border bg-card p-0 text-text shadow-2xl backdrop:bg-black/35">
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <h2 id="runtime-diagnostics-title" className="text-lg font-medium">运行诊断</h2>
        <button type="button" autoFocus aria-label="关闭运行诊断" onClick={() => dialog.current?.close()} className="rounded-md p-2 text-text-muted hover:bg-bg"><X className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 overflow-y-auto p-5">
        {sessions.length ? <>
          <label className="mb-4 flex items-center gap-3 text-sm">查看会话
            <select value={sessionId} onChange={event => setSelected(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2">
              {sessions.map(session => <option key={session.id} value={session.id}>{session.title || '未命名会话'}</option>)}
            </select>
          </label>
          <div key={sessionId} className="space-y-4">
            <MonSyncPanel sessionId={sessionId} />
            <OperationPanel sessionId={sessionId} />
            <McpPanel sessionId={sessionId} />
          </div>
        </> : <p className="py-8 text-center text-sm text-text-muted">当前没有可查看的会话。</p>}
      </div>
    </div>
  </dialog>
}
