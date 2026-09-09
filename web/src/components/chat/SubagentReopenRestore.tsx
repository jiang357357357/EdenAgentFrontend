import { useState } from 'react'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function SubagentReopenRestore({ agentId, onSaved }: { agentId: string; onSaved: () => Promise<void> }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function reopen() {
    if (!confirmed) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin(origin, 'agent.recovery.reopen', { agentId, note, confirmReopen: true })
      await onSaved(); setConfirmed(false)
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>重开已恢复的子会话</summary>
    <p>先刷新恢复准备情况并处理待办。此操作激活已确认的模型与策略，保留历史上下文和预算用量。旧输入、作业和信箱中的待处理项须先核对。</p>
    <textarea aria-label="旧子会话重开说明" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="说明恢复条件与遗留操作的处理结果" className="mt-2 w-full rounded border p-2" />
    <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我确认恢复条件已经处理，允许重开此子会话。</label>
    <button disabled={busy || !confirmed || !note.trim()} onClick={() => void reopen()} className="mt-2 rounded border px-2 py-1">确认重开</button>
    <p>重开不会自动重发旧任务。需要继续工作时另行发送续接指令；迁移模式仍禁止执行任务。</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
