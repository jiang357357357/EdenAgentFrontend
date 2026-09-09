import { useState } from 'react'
import { NotificationOutcomeReview } from './NotificationOutcomeReview'
import { RunOutcomeReview } from './RunOutcomeReview'
import type { SelfAwakeRunInfo } from '@eden/api'
import { JobOutcomeReview } from '../../components/chat/JobOutcomeReview'
import { InputOutcomeReview } from '../../components/chat/InputOutcomeReview'
import { SelfAwakeJobResubmit } from '../../components/chat/SelfAwakeJobResubmit'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'

export function SelfAwakeRecoveryPanel() {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [runs, setRuns] = useState<SelfAwakeRunInfo[]>([]), [selected, setSelected] = useState('')
  const [page, setPage] = useState(1), [pages, setPages] = useState(0)
  const run = runs.find(value => value.id === selected)
  async function load(next: number) {
    setBusy(true); setError(''); setSelected('')
    try { const result = await rpcRequestForOrigin(origin, 'self_awake.list', { page: next, pageSize: 20 }); setRuns(result.results); setPage(result.page); setPages(result.totalPages) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <div className="absolute right-4 top-16 z-30">
    <button onClick={() => setOpen(!open)} aria-expanded={open} className="rounded border bg-white px-3 py-1">自醒作业恢复</button>
    {open && <section aria-label="自醒作业恢复" className="mt-2 max-h-[70vh] w-[min(38rem,90vw)] overflow-auto rounded border bg-white p-3 shadow-lg">
      <JobOutcomeReview kind="self_awake" title="未完成的自醒作业" />
      <p className="mt-3">作业完成不代表决策有效。下方按页查看自醒记录；失败决策可重新生成，动作失败请在原记录中恢复动作。</p>
      <button disabled={busy} onClick={() => void load(1)} className="my-2 rounded border px-2 py-1">刷新自醒记录</button>
      {runs.map(value => <button key={value.id} disabled={busy} onClick={() => setSelected(value.id)} className="block w-full rounded border p-1 text-left">{new Date(value.createdAt).toLocaleString()} · {value.status} · {value.id}</button>)}
      <div className="flex gap-2"><button disabled={busy || page <= 1} onClick={() => void load(page - 1)}>上一页</button><span>{page} / {pages}</span><button disabled={busy || page >= pages} onClick={() => void load(page + 1)}>下一页</button></div>
      {run && <><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(run, null, 2)}</pre>
        <NotificationOutcomeReview key={run.id} runId={run.id} />
        {run.status === 'interrupted' && <><InputOutcomeReview key={`input:${run.id}`} sessionId={run.sessionId} /><RunOutcomeReview key={`run:${run.id}`} runId={run.id} /></>}
        {run.status === 'failed' && <><InputOutcomeReview key={run.sessionId} sessionId={run.sessionId} /><SelfAwakeJobResubmit key={run.jobId} jobId={run.jobId} /></>}
      </>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </section>}
  </div>
}
