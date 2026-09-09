import { useState } from 'react'
import type { JsonValue } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function NotificationOutcomeReview({ runId }: { runId: string }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [record, setRecord] = useState<{ fingerprint: string; record: JsonValue; state: string } | null>(null)
  const [decision, setDecision] = useState<'delivered' | 'suppressed'>('suppressed'), [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(false)
  async function load() {
    setBusy(true); setError(''); setConfirmed(false)
    try { setRecord(await rpcRequestForOrigin(origin, 'self_awake.notification.review', { runId })); setLoaded(true) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function resolve() {
    if (!record || !confirmed) return
    setBusy(true); setError('')
    try { setRecord(await rpcRequestForOrigin(origin, 'self_awake.notification.resolve', { runId, fingerprint: record.fingerprint, decision, note, confirmOutcome: true })); setConfirmed(false) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>历史通知结果核对</summary>
    <button disabled={busy} onClick={() => void load()} className="my-2 rounded border px-2 py-1">读取原通知记录</button>
    {loaded && !record && <p>本轮没有历史迁移通知记录。</p>}
    {record && <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(record.record, null, 2)}</pre>}
    {record?.state === 'unknown' && <>
      <p>此操作只记录人工核对，不发送通知。确认已投递不表示用户已读；停止后续投递不证明此前没有外发。</p>
      <select disabled={busy} value={decision} onChange={event => { setDecision(event.target.value as typeof decision); setConfirmed(false) }}><option value="suppressed">停止后续投递</option><option value="delivered">依据回执确认已投递</option></select>
      <textarea aria-label="历史通知核对依据" value={note} disabled={busy} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="填写原回执或停止投递的依据" className="mt-2 w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我已核对原记录并确认此处置。</label>
      <button disabled={busy || !confirmed || !note.trim()} onClick={() => void resolve()} className="my-2 rounded border px-2 py-1">保存核对结果</button>
    </>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
