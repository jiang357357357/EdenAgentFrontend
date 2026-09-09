import { useState } from 'react'
import { InputResubmission } from './InputResubmission'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
interface Item { id: string; turnId: string; state: string; kind: string; text: string; truncated: boolean; fingerprint: string; createdAt: number }
export function InputOutcomeReview({ sessionId }: { sessionId: string }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [items, setItems] = useState<Item[]>([]), [cursor, setCursor] = useState<string | null>(null), [selected, setSelected] = useState('')
  const [decision, setDecision] = useState<'completed' | 'cancelled'>('cancelled'), [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const item = items.find(value => value.id === selected)
  async function load(after?: string) {
    setBusy(true); setError(''); setSelected(''); setConfirmed(false)
    try { const result = await rpcRequestForOrigin(origin, 'input.recovery.list', { sessionId, includeCancelled: true, ...(after ? { after } : {}) }); setItems(result.items); setCursor(result.nextCursor) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function resolve() {
    if (!item || !confirmed) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin(origin, 'input.recovery.resolve', { sessionId, id: item.id, fingerprint: item.fingerprint, decision, note, confirmOutcome: true })
      setItems(current => current.filter(value => value.id !== item.id)); setSelected(''); setConfirmed(false)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>被保留或中断的输入</summary>
    <button disabled={busy} onClick={() => void load()} className="my-2 rounded border px-2 py-1">刷新待处理输入</button>
    {items.map(value => <button key={value.id} disabled={busy} onClick={() => { setSelected(value.id); setConfirmed(false); setDecision('cancelled'); setNote('') }} className="block w-full rounded border p-1 text-left">{value.kind} · {value.state} · {new Date(value.createdAt).toLocaleString()}</button>)}
    {cursor && <button disabled={busy} onClick={() => void load(cursor)} className="my-2 rounded border px-2 py-1">下一页</button>}
    {item?.state === 'cancelled' && <InputResubmission key={item.id} sessionId={sessionId} id={item.id} />}
    {item && item.state !== 'cancelled' && <><p className="break-all">原回合：{item.turnId}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{item.text}</pre>
      {item.truncated && <p>正文过长，当前仅显示前 32000 字符；请结合原会话记录核对。</p>}
      <select disabled={busy} value={decision} onChange={event => { setDecision(event.target.value as typeof decision); setConfirmed(false) }} className="rounded border p-1"><option value="cancelled">停止继续处理此输入</option><option value="completed">依据执行记录确认已完成</option></select>
      <textarea aria-label="输入结果确认依据" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="说明执行结果或停止继续处理的原因" className="mt-2 w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我已核对原记录并确认此处理结果。</label>
      <button disabled={busy || !confirmed || !note.trim()} onClick={() => void resolve()} className="mt-2 rounded border px-2 py-1">保存输入处置</button>
      <p>原输入、回合错误与工具记录保留。不自动重发输入；需要后续工作时应另行明确提交。</p></>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
