import { useState } from 'react'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function RunOutcomeReview({ runId }: { runId: string }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [preview, setPreview] = useState<{ fingerprint: string; state: string } | null>(null)
  const [decision, setDecision] = useState<'completed' | 'failed'>('failed'), [note, setNote] = useState('')
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [error, setError] = useState('')
  async function load() {
    setBusy(true); setConfirmed(false); setError('')
    try { setPreview(await rpcRequestForOrigin(origin, 'self_awake.run.review', { runId })) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function resolve() {
    if (!preview || !confirmed) return
    setBusy(true); setError('')
    try { setPreview(await rpcRequestForOrigin(origin, 'self_awake.run.resolve', { runId, fingerprint: preview.fingerprint, decision, note, confirmOutcome: true })); setConfirmed(false) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <div className="mt-2 rounded border p-2">
    <p>核对原作业、输入和执行证据后，处理历史中断状态。只保存人工决定，不重发通知、动作或定时器。</p>
    <button disabled={busy} onClick={() => void load()} className="my-2 rounded border px-2 py-1">读取中断状态</button>
    {preview?.state === 'interrupted' && <><select disabled={busy} value={decision} onChange={event => { setDecision(event.target.value as typeof decision); setConfirmed(false) }}><option value="failed">确认未完成并结束本次运行</option><option value="completed">依据记录确认已完成</option></select>
      <textarea aria-label="自醒运行核对依据" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} className="mt-2 w-full rounded border p-2" placeholder="说明原运行结果和判断依据" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我已核对原记录，确认上述处置。</label>
      <button disabled={busy || !confirmed || !note.trim()} onClick={() => void resolve()} className="my-2 rounded border px-2 py-1">保存处置</button></>}
    {preview && preview.state !== 'interrupted' && <p role="status">当前状态：{preview.state}。刷新自醒列表可查看最新记录。</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>
}
