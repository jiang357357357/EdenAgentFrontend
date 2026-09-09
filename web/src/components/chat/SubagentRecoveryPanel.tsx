import { useState } from 'react'
import type { SubagentRecovery } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function SubagentRecoveryPanel({ agentId }: { agentId: string }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [report, setReport] = useState<SubagentRecovery | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function refresh() {
    setBusy(true); setError('')
    try { setReport(await rpcRequestForOrigin(origin, 'agent.recovery.read', { agentId })) }
    catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>旧任务恢复准备情况</summary>
    <p>核对各项恢复条件后再处理旧任务。此处仅读取状态，不启动任务或修改历史权限。</p>
    <button type="button" disabled={busy} onClick={() => void refresh()} className="my-2 rounded border px-2 py-1">{busy ? '读取中…' : '刷新准备情况'}</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {report && <>
      <p>子会话：{report.sessionStatus} · 恢复状态：{report.legacyState ?? '无历史迁移记录'}</p>
      <ul className="mt-2 space-y-1">{report.checks.map(item => <li key={item.key}>
        <span className={item.satisfied ? 'text-green-700' : 'text-amber-700'}>{item.satisfied ? '已具备' : '待处理'}</span> · {item.detail}
      </li>)}</ul>
      <p className="mt-2">以上是本次读取时的准备条件，不是执行成功或迁移验收证明。</p>
    </>}
  </details>
}
