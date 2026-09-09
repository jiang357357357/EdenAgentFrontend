import { useState } from 'react'
import { JobOutcomeReview } from '../chat/JobOutcomeReview'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function MemoJobRecoveryPanel() {
  const [open, setOpen] = useState(false)
  const origin = getStoredRuntimeOrigin() ?? 'mon'
  return <div className="relative text-sm">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-stone-700">提醒作业恢复</button>
    {open && <section aria-label="提醒作业恢复" className="absolute right-0 top-full z-50 mt-2 max-h-[65vh] w-[min(36rem,85vw)] overflow-auto rounded-lg border border-stone-200 bg-white p-3 text-stone-800 shadow-xl">
      <p>查看当前世界的提醒作业，包括没有关联会话的提醒。结果未确认时先核对原记录；已停止的提醒可以明确重提。</p>
      <JobOutcomeReview key={`${origin}:original`} kind="memo.reminder" title="原提醒作业" />
      <JobOutcomeReview key={`${origin}:redelivery`} kind="memo.reminder.redelivery" title="历史提醒重发作业" />
    </section>}
  </div>
}
