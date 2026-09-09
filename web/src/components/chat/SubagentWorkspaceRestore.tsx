import { useState } from 'react'
import { useScopedRpc } from '../../lib/use-scoped-rpc'
export function SubagentWorkspaceRestore({ agentId, onSaved }: { agentId: string; onSaved: () => Promise<void> }) {
  const rpcRequest = useScopedRpc()
  const [root, setRoot] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmed, setConfirmed] = useState(false)
  async function load() {
    setBusy(true); setError(''); setConfirmed(false); setRoot('')
    try { setRoot((await rpcRequest('workspace.info', {})).path) } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function save() {
    setBusy(true); setError('')
    try { await rpcRequest('agent.workspace.restore', { agentId, workspaceRoot: root, confirmOwnership: true }); await onSaved() }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>恢复任务工作区归属</summary>
    <p>核对原任务后，选择它应使用的工作区。此操作仅补齐缺失归属，不启动任务，也不恢复执行权限；嵌套任务先恢复父任务。</p>
    <button disabled={busy} onClick={() => void load()} className="rounded border px-2 py-1">读取当前工作区</button>
    {root && <><p className="break-all">{root}</p><label><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我确认这是该任务的工作区。</label>
      <button disabled={busy || !confirmed} onClick={() => void save()} className="ml-2 rounded border px-2 py-1">记录归属</button></>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
