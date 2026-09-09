import { useState } from 'react'
import type { JsonValue, JobInfo } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function SelfAwakeJobResubmit({ jobId }: { jobId: string }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [preview, setPreview] = useState<{ fingerprint: string; job: JobInfo; runId: string | null; author: JsonValue; environment: JsonValue } | null>(null)
  const [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState('')
  async function load() {
    setBusy(true); setError(''); setPreview(null); setConfirmed(false)
    try { setPreview(await rpcRequestForOrigin(origin, 'self_awake.job.preview', { id: jobId })) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function submit() {
    if (!preview || !confirmed || busy) return
    setBusy(true); setError('')
    try {
      const job = await rpcRequestForOrigin(origin, 'self_awake.job.resubmit', { id: jobId, fingerprint: preview.fingerprint, note, confirmResubmit: true })
      setResult(`已受理新的自醒作业 ${job.id}，状态：${job.state}`); setConfirmed(false)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <div className="mt-2 rounded border p-2">
    <p>重新生成失败的自醒决策。原工具、日记和通知记录保留；已有决策的动作失败须使用动作恢复。</p>
    <button disabled={busy || Boolean(result)} onClick={() => void load()} className="my-2 rounded border px-2 py-1">查看重提依据</button>
    {preview && <><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(preview, null, 2)}</pre>
      <textarea aria-label="自醒重提依据" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="说明原执行结果、已发生的副作用及重新决策的原因" className="mt-2 w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我已核对原执行记录，明确要求以显示的角色和环境重新决策，可能立即运行。</label>
      <button disabled={busy || !confirmed || !note.trim() || Boolean(result)} onClick={() => void submit()} className="mt-2 rounded border px-2 py-1">确认重新决策</button></>}
    <p>迁移审阅模式仅允许预览。所有工具副作用仍须审批。</p>
    {result && <p role="status">{result}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
  </div>
}
