import { selfAwakeModelRounds } from '../../lib/self-awake-model-rounds'
import { SelfAwakeToolCard } from './SelfAwakeToolCard'

export function SelfAwakeModelCalls({ record }: { record: unknown }) {
  const { rounds, unassigned } = selfAwakeModelRounds(record)
  if (!rounds.length && !unassigned.length) return <p className="mt-2 text-text-muted">尚无模型请求记录。</p>
  return <div className="mt-2 space-y-3">
    <p className="text-sm text-text-muted">{rounds.length ? `${rounds.length} 次模型 API 请求` : "模型请求记录缺失"} · {rounds.reduce((n, round) => n + round.tools.length, unassigned.length)} 次工具调用</p>
    {!rounds.length && unassigned.length > 0 ? <p className="text-sm text-text-muted">已读取工具调用，但接口没有返回模型请求记录。请重启 Agent 服务后刷新。</p> : null}
    {rounds.map((round, index) => <section key={round.id} className="border-t border-border pt-2">
      <h5 className="text-sm font-medium">第 {index + 1} 次 API 请求 · {round.tools.length} 个工具调用</h5>
      <p className="mb-2 break-all text-xs text-text-muted">{round.model}</p>
      {!round.responded ? <p className="text-sm text-text-muted">尚未记录模型响应。</p> : !round.tools.length ? <p className="text-sm text-text-muted">本次响应没有工具调用。</p> : null}
      <ul className="space-y-2">{round.tools.map(execution => <SelfAwakeToolCard key={execution.id} execution={execution} />)}</ul>
    </section>)}
    {unassigned.length > 0 ? <section><h5 className="text-sm">未关联到模型响应的工具</h5><ul>{unassigned.map(execution => <SelfAwakeToolCard key={execution.id} execution={execution} />)}</ul></section> : null}
  </div>
}
