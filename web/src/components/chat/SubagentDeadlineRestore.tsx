import { useState } from 'react'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function SubagentDeadlineRestore({ agentId, deadline, onSaved }: { agentId: string; deadline: number | null; onSaved: () => Promise<void> }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [minutes, setMinutes] = useState(30), [note, setNote] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID()), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const changed = () => { setKey(crypto.randomUUID()); setConfirmed(false) }
  async function renew() {
    if (!confirmed) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin(origin, 'agent.recovery.deadline', { agentId, idempotencyKey: key, expectedDeadline: deadline,
        timeoutMs: minutes * 60000, note, confirmRenewal: true })
      await onSaved(); changed()
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>恢复旧任务的截止期限</summary>
    <p>当前截止：{deadline == null ? '未设置' : new Date(deadline).toLocaleString()}。续期从确认时计算，受已固定角色的最长时限和父任务截止时间约束。</p>
    <label>续期分钟数 <input type="number" min={1} max={1440} disabled={busy} value={minutes} onChange={event => { setMinutes(Number(event.target.value)); changed() }} className="w-20 rounded border p-1" /></label>
    <textarea aria-label="旧任务续期原因" disabled={busy} value={note} onChange={event => { setNote(event.target.value); changed() }} placeholder="说明迁移停留或重新安排执行时间的原因" className="mt-2 w-full rounded border p-2" />
    <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我明确允许延长此旧任务期限。</label>
    <button disabled={busy || !confirmed || !note.trim() || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440} onClick={() => void renew()} className="mt-2 rounded border px-2 py-1">确认续期</button>
    <p>此操作记录原期限与续期原因，不重置用量、不增加调用/费用预算，也不启动任务；父任务已过期时先处理父任务。</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
