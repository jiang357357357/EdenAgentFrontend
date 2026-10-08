import { Circle, Timer } from 'lucide-react'
import { useId } from 'react'
import { formatReplyTimer } from '../../../lib/reply-timer'
import { useReplyTimer } from '../../../lib/use-reply-timer'
import { cn } from '../../../lib/utils'

export function ReplyTimer({ sessionId }: { sessionId?: string }) {
  const { view, running, elapsedMs, durations } = useReplyTimer(sessionId)
  return <ReplyTimerDisplay elapsedMs={elapsedMs} running={running} durations={durations}
    loading={Boolean(sessionId && !view?.snapshot)} unavailable={Boolean(view?.error)}
    reconnecting={Boolean(view?.snapshot && !view.connected)} outcome={view?.snapshot?.turn?.outcome} />
}

export function ReplyTimerDisplay({ elapsedMs, running, durations, loading = false, unavailable = false, reconnecting = false, outcome }: {
  elapsedMs: number; running: boolean; loading?: boolean; unavailable?: boolean; reconnecting?: boolean
  durations?: { thinkingMs: number; toolMs: number; turnMs: number }
  outcome?: 'running' | 'completed' | 'interrupted' | 'failed'
}) {
  const tooltipId = useId()
  const time = loading ? '--:--' : formatReplyTimer(elapsedMs)
  const detailTime = (value: number | undefined) => loading || value === undefined ? '--:--' : formatReplyTimer(value)
  const status = unavailable ? '计时记录暂时无法读取' : reconnecting ? '连接恢复中，耗时待核实'
    : loading ? '正在读取计时记录' : running ? '正在回答' : outcome === 'interrupted' ? '已停止'
      : outcome === 'failed' ? '回答失败' : outcome === 'completed' ? '回答结束' : '尚未开始回答'
  return (
    <div className="group/token relative flex h-[6vh] w-[6vh] items-center justify-center">
      <div role="timer" aria-live="off" tabIndex={0} aria-describedby={tooltipId}
        aria-label={`本轮回答耗时 ${time}，${status}`}
        className={cn('relative flex h-[6vh] w-[6vh] flex-col items-center justify-center rounded-full bg-card font-medium tabular-nums outline-none transition-transform hover:scale-[1.04] focus-visible:scale-[1.04]', running ? 'text-accent' : 'text-text-muted')}>
        <Circle className={cn('absolute inset-0 h-full w-full', running ? 'text-accent' : 'text-border')} strokeWidth={1.7} aria-hidden="true" />
        <Timer className="relative h-[2.1vh] w-[2.1vh]" aria-hidden="true" />
        <span className="relative whitespace-nowrap text-center" style={{ fontSize: '1.2vh', lineHeight: '1.5vh' }}>{time}</span>
      </div>
      <div id={tooltipId} role="tooltip"
        className="pointer-events-none invisible absolute bottom-[calc(100%+1.25vh)] right-0 z-50 w-[30vh] max-w-[calc(100vw-3vh)] translate-y-[0.35vh] rounded-[1.05vh] border border-border bg-card/98 px-[1.6vh] py-[1.15vh] text-[1.45vh] text-text opacity-0 shadow-lg backdrop-blur-md transition-[opacity,transform,visibility] duration-150 group-hover/token:visible group-hover/token:translate-y-0 group-hover/token:opacity-100 group-focus-within/token:visible group-focus-within/token:translate-y-0 group-focus-within/token:opacity-100">
        <div className="font-medium">本轮耗时</div>
        <div className="mt-[0.35vh] text-text-muted">{status}</div>
        <dl className="my-[1vh] grid grid-cols-[1fr_auto] gap-x-[2vh] gap-y-[0.65vh] border-y border-border py-[1vh] tabular-nums">
          <dt className="text-text-muted">思考耗时</dt><dd className="text-right">{detailTime(durations?.thinkingMs)}</dd>
          <dt className="text-text-muted">工具耗时</dt><dd className="text-right">{detailTime(durations?.toolMs)}</dd>
          <dt className="text-text-muted">会话耗时</dt><dd className="text-right">{time}</dd>
        </dl>
        <div className="text-[1.2vh] leading-relaxed text-text-muted">思考含模型响应，工具含审批等待。会话为本轮总耗时，不计排队；下一轮归零。</div>
        {!loading && !durations && <div className="mt-[0.5vh] text-[1.2vh] text-text-muted">分项计时待服务端记录恢复</div>}
      </div>
    </div>
  )
}
