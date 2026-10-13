import type { SelfAwakeToolExecution } from '../../lib/self-awake-context'
import { selfAwakeToolSummary } from '../../lib/self-awake-tool-summary'
import { ToolParameters } from '../../components/chat/message/ToolParameters'
import { ToolOutput } from '../../components/chat/message/ToolOutput'

export function SelfAwakeToolCard({ execution }: { execution: SelfAwakeToolExecution }) {
  const { title, summary, decodedResult } = selfAwakeToolSummary(execution)
  const state = execution.status
  return <li className="rounded bg-bg/70 px-3 py-2 text-sm">
    <div className="flex items-center gap-2">
      <span className="min-w-0 font-medium">{title}</span>
      <span className={`shrink-0 text-xs ${state === 'succeeded' ? 'text-success' : state === 'failed' ? 'text-danger' : 'text-warning'}`}>
        {state === 'succeeded' ? '成功' : state === 'failed' ? '失败' : '执行中'}
      </span>
    </div>
    <p className="mt-1 whitespace-pre-wrap break-words text-text-muted">{summary}</p>
    <details className="mt-2 text-xs text-text-muted">
      <summary className="cursor-pointer">查看参数与结果</summary>
      <p className="mt-2 break-all">工具：{execution.name}</p>
      <p className="mt-2">调用参数</p>
      <ToolParameters input={JSON.stringify(execution.args ?? null)} variant="dialog" />
      <p className="mt-2">返回内容</p>
      <ToolOutput output={JSON.stringify(decodedResult ?? null)} variant="dialog" />
      <details className="mt-2"><summary className="cursor-pointer">原始回执</summary>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(execution.rawResult ?? null, null, 2)}</pre>
      </details>
    </details>
  </li>
}
