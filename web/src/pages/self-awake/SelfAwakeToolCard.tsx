import type { SelfAwakeToolExecution } from '../../lib/self-awake-context'
import { selfAwakeToolSummary } from '../../lib/self-awake-tool-summary'

export function SelfAwakeToolCard({ execution }: { execution: SelfAwakeToolExecution }) {
  const { title, summary, decodedResult } = selfAwakeToolSummary(execution)
  const state = execution.status
  return <li className="rounded bg-bg/70 px-3 py-2 text-sm">
    <div className="flex items-center gap-2">
      <span className="min-w-0 font-medium">{title}</span>
      <span className={`shrink-0 text-xs ${state === 'succeeded' ? 'text-emerald-600' : state === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>
        {state === 'succeeded' ? '成功' : state === 'failed' ? '失败' : '执行中'}
      </span>
    </div>
    <p className="mt-1 whitespace-pre-wrap break-words text-text-muted">{summary}</p>
    <details className="mt-2 text-xs text-text-muted">
      <summary className="cursor-pointer">查看参数与结果</summary>
      <p className="mt-2 break-all">工具：{execution.name}</p>
      <p className="mt-2">调用参数</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(execution.args ?? null, null, 2)}</pre>
      <p className="mt-2">返回内容</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{typeof decodedResult === 'string' ? decodedResult : JSON.stringify(decodedResult ?? null, null, 2)}</pre>
      <details className="mt-2"><summary className="cursor-pointer">原始结果</summary>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(execution.rawResult ?? null, null, 2)}</pre>
      </details>
    </details>
  </li>
}
