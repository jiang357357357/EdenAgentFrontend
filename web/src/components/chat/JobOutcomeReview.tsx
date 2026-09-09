import { useState } from 'react'
import { MemoJobResubmit } from './MemoJobResubmit'
import { PluginHookResubmit } from './PluginHookResubmit'
import { SelfAwakeJobResubmit } from './SelfAwakeJobResubmit'
import { InputOutcomeReview } from './InputOutcomeReview'
import type { JobInfo, JobCursor } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function JobOutcomeReview({ sessionId, kind, title = '作业结果与恢复' }: { sessionId?: string; kind?: string; title?: string }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [jobs, setJobs] = useState<JobInfo[]>([]), [selected, setSelected] = useState('')
  const [cursor, setCursor] = useState<JobCursor | null>(null)
  const [decision, setDecision] = useState<'completed' | 'cancelled'>('cancelled'), [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const job = jobs.find(value => value.id === selected)
  async function load(before?: JobCursor) {
    setBusy(true); setError(''); setSelected(''); setConfirmed(false)
    try { const page = await rpcRequestForOrigin(origin, 'job.page', { ...(sessionId ? { sessionId } : {}), ...(kind ? { kind } : {}), states: ['unknown', 'failed', 'cancelled'], ...(before ? { before } : {}), limit: 20 }); setJobs(page.items); setCursor(page.nextCursor) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function resolve() {
    if (!job || !confirmed) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin(origin, 'job.resolve', { id: job.id, expectedUpdatedAt: job.updatedAt, decision, note, confirmOutcome: true })
      setJobs(current => current.filter(value => value.id !== job.id)); setSelected(''); setConfirmed(false)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>{title}</summary>
    <button disabled={busy} onClick={() => void load()} className="my-2 rounded border px-2 py-1">刷新待确认及已停止作业</button>
    {jobs.map(value => <button key={value.id} disabled={busy} onClick={() => { setSelected(value.id); setConfirmed(false); setNote(''); setDecision('cancelled') }} className="block w-full rounded border p-1 text-left">{value.kind} · {new Date(value.createdAt).toLocaleString()}</button>)}
    {cursor && <button disabled={busy} onClick={() => void load(cursor)} className="my-2 rounded border px-2 py-1">更早的待处理作业</button>}
    {job?.inputId && job.sessionId && <InputOutcomeReview key={`${job.id}:${job.sessionId}`} sessionId={job.sessionId} />}
    {job && ['failed','cancelled'].includes(job.state) && ['memo.reminder','memo.reminder.redelivery'].includes(job.kind) && <MemoJobResubmit key={job.id} job={job} />}
    {job && ['failed','cancelled'].includes(job.state) && job.kind === 'plugin.hook' && <PluginHookResubmit key={job.id} job={job} />}
    {job && ['failed','cancelled'].includes(job.state) && job.kind === 'self_awake' && <SelfAwakeJobResubmit key={job.id} jobId={job.id} />}
    {job && job.state === 'unknown' && <><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(job, null, 2)}</pre>
      <select disabled={busy} value={decision} onChange={event => { setDecision(event.target.value as typeof decision); setConfirmed(false) }} className="rounded border p-1"><option value="cancelled">停止后续投递</option><option value="completed">依据记录确认已完成</option></select>
      <textarea aria-label="作业结果确认依据" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="说明投递回执、执行记录或停止后续投递的依据" className="mt-2 w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我已核对记录并确认此处置。</label>
      <button disabled={busy || !confirmed || !note.trim()} onClick={() => void resolve()} className="mt-2 rounded border px-2 py-1">保存作业结果确认</button>
      <p>不重发作业；停止后续投递不代表之前没有副作用。关联输入须先处理，未知工具操作仍须单独核对。</p></>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
