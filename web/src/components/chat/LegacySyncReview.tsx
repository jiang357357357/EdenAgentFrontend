import { useEffect, useRef, useState } from 'react'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function LegacySyncReview({ sessionId, id, onResolved }: { sessionId: string; id: number; onResolved: () => void }) {
  const [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const mounted = useRef(true), locked = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const resolve = async (decision: 'confirm_completed' | 'abandon') => {
    if (locked.current || !note.trim() || getStoredRuntimeOrigin() !== 'mon') return
    locked.current = true; setBusy(true); setError('')
    try {
      await rpcRequestForOrigin('mon', 'mon.sync.legacy.resolve', { sessionId, id, decision, note: note.trim() })
      if (mounted.current && getStoredRuntimeOrigin() === 'mon') onResolved()
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  return <div className="space-y-1 border-l pl-2">
    <p>核实旧记录后再提交决定。放弃表示不恢复这条旧投递；这两个操作不会重发旧请求。全部未决项处理后，正常同步可继续。</p>
    <label className="block">处理说明
      <textarea aria-label={`历史投递 ${id} 的处理说明`} value={note} maxLength={2000} disabled={busy}
        onChange={event => setNote(event.target.value)} className="block w-full rounded border bg-transparent p-1" />
    </label>
    <div className="flex gap-3">
      <button type="button" disabled={busy || !note.trim()} onClick={() => void resolve('confirm_completed')}>记录已核实完成</button>
      <button type="button" disabled={busy || !note.trim()} onClick={() => void resolve('abandon')}>放弃这条旧投递</button>
    </div>
    {busy && <p role="status">正在保存决定…</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
