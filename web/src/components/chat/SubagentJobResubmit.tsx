import { useState } from 'react'
import type { JobInfo, JobCursor } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
export function SubagentJobResubmit({ agentId, sessionId, onSaved }: { agentId: string; sessionId: string; onSaved: () => Promise<void> }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [jobs, setJobs] = useState<JobInfo[]>([]), [selected, setSelected] = useState(''), [note, setNote] = useState('')
  const [cursor, setCursor] = useState<JobCursor | null>(null)
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const job = jobs.find(value => value.id === selected)
  async function load(before?: JobCursor) {
    setBusy(true); setError(''); setSelected(''); setConfirmed(false)
    try {
      const page = await rpcRequestForOrigin(origin, 'job.page', { sessionId, kind: 'subagent.turn', states: ['cancelled','failed'], ...(before ? { before } : {}), limit: 20 })
      setJobs(page.items); setCursor(page.nextCursor)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function submit() {
    if (!job || !confirmed) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin(origin, 'agent.job.resubmit', { agentId, jobId: job.id, expectedUpdatedAt: job.updatedAt, note, confirmResubmit: true })
      await onSaved(); setSelected(''); setConfirmed(false)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>明确重新提交子任务作业</summary>
    <p>先处置原输入和未知副作用，再恢复子会话。重新提交使用原任务消息，计入新一轮任务预算；普通模式下可能立即执行，迁移模式禁止执行。</p>
    <button disabled={busy} onClick={() => void load()} className="my-2 rounded border px-2 py-1">刷新可重提作业</button>
    {jobs.map(value => <button key={value.id} disabled={busy} onClick={() => { setSelected(value.id); setConfirmed(false); setNote('') }} className="block w-full rounded border p-1 text-left">{value.id} · {value.state}</button>)}
    {cursor && <button disabled={busy} onClick={() => void load(cursor)} className="my-2 rounded border px-2 py-1">更早的可重提作业</button>}
    {job && <><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(job.payload, null, 2)}</pre>
      <textarea aria-label="子任务作业重提依据" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="说明原任务处置和再次执行的原因" className="mt-2 w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我明确要求重新排队此子任务。</label>
      <button disabled={busy || !confirmed || !note.trim()} onClick={() => void submit()} className="mt-2 rounded border px-2 py-1">确认重提作业</button></>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
