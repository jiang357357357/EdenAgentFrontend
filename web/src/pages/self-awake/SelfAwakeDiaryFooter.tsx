import { useEffect, useState } from 'react'
import { selfAwakeElapsed, selfAwakeRecordMatches, selfAwakeUsage, type SelfAwakeTiming } from '../../lib/self-awake-metrics'
import { formatReplyDuration } from '../../lib/reply-duration'
import { SelfAwakeMetricsPopover } from './SelfAwakeMetricsPopover'

interface Props {
  runId: string
  statusLabel: string
  nextWakeLabel: string
  historicalAction?: string
  timing: SelfAwakeTiming
  record: unknown
  loading: boolean
  error: string
}

export function SelfAwakeDiaryFooter({ runId, statusLabel, nextWakeLabel, historicalAction, timing, record, loading, error }: Props) {
  const [now, setNow] = useState(Date.now)
  const elapsed = selfAwakeElapsed(record, runId, timing, now)
  useEffect(() => {
    if (!elapsed.running) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [runId, elapsed.running])
  const usage = selfAwakeUsage(record, runId)
  const matched = selfAwakeRecordMatches(record, runId)
  const reading = !error && (loading || !matched)
  const duration = `${formatReplyDuration(elapsed.durationMs) ?? '未知'}${elapsed.running && elapsed.durationMs !== undefined ? '（进行中）' : ''}`
  const card = 'rounded-[0.55vh] border border-border bg-card/38 px-[1.15vw] py-[0.92vh]'
  return <footer aria-label="本次自醒统计" className="flex flex-wrap items-center gap-[1.45vw] pt-[2.8vh] text-[1.52vh]">
    <div className={card}>
      <span className="mr-[0.65vw] text-text-muted">状态</span>
      <span className="text-text">{statusLabel}</span>
    </div>
    <div className={card}>
      <span className="mr-[0.65vw] text-text-muted">本轮定时</span>
      <span className="text-text">{nextWakeLabel}</span>
    </div>
    <SelfAwakeMetricsPopover key={runId} duration={duration} usage={usage} reading={reading} error={error} cardClassName={card} />
    {historicalAction && <div className={card}>
      <span className="mr-[0.65vw] text-text-muted">历史动作</span>
      <span className="text-text">{historicalAction}</span>
    </div>}
  </footer>
}
