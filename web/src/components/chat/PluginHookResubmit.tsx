import { useState } from 'react'
import type { JobInfo } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function PluginHookResubmit({ job }: { job: JobInfo }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState('')
  async function submit() {
    if (!confirmed || busy) return
    setBusy(true); setError('')
    try {
      const next = await rpcRequestForOrigin(origin, 'plugin.hook.resubmit', { id: job.id, expectedUpdatedAt: job.updatedAt, note, confirmResubmit: true })
      setResult(`已受理钩子作业 ${next.id}，状态：${next.state}`); setConfirmed(false)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <div className="mt-2 rounded border p-2">
    <p>重新处理原事件，使用原插件版本与绑定技能。插件须仍启用且获授权；原输入与未知副作用须先处理。</p>
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap">{JSON.stringify(job, null, 2)}</pre>
    <textarea aria-label="插件钩子重提依据" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="说明原作业处置及重新处理事件的原因" className="mt-2 w-full rounded border p-2" />
    <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我明确要求重新处理此事件，可能立即开始对话；副作用仍需审批。</label>
    <button disabled={busy || !confirmed || !note.trim() || Boolean(result)} onClick={() => void submit()} className="mt-2 rounded border px-2 py-1">确认重提钩子作业</button>
    <p>迁移审阅模式禁止执行此操作。</p>
    {result && <p role="status">{result}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
  </div>
}
