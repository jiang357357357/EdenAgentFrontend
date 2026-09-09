import { useEffect, useRef, useState } from 'react'
import { JobOutcomeReview } from './JobOutcomeReview'
import { InputOutcomeReview } from './InputOutcomeReview'
import type { OperationInfo } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

const labels: Record<string, string> = { running: '执行中', completed: '已完成', failed: '失败或已处理', unknown: '结果未知' }
function display(value: unknown) {
  const text = JSON.stringify(value, null, 2) ?? '无记录'
  return text.length > 16000 ? text.slice(0, 16000) + '\n…内容较长，已截断显示' : text
}
export function OperationPanel({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false), [unknownOnly, setUnknownOnly] = useState(true)
  const [items, setItems] = useState<OperationInfo[] | null>(null), [error, setError] = useState('')
  const [busy, setBusy] = useState(''), [refresh, setRefresh] = useState(0), [notice, setNotice] = useState('')
  const readEpoch = useRef(0)
  const scope = useRef(0), mutating = useRef(false), valid = useRef(true)
  const origin = getStoredRuntimeOrigin()
  useEffect(() => {
    valid.current = true
    const changed = () => { valid.current = false; scope.current++; setItems(null); setError('世界已切换，请重新打开会话。') }
    window.addEventListener('edenagent:runtime-origin-changed', changed)
    return () => { valid.current = false; scope.current++; window.removeEventListener('edenagent:runtime-origin-changed', changed) }
  }, [sessionId, origin])
  useEffect(() => {
    const generation = ++scope.current
    setItems(null); setError(''); setNotice('')
    if (!open) return
    let active = true, pending = false
    const current = () => active && valid.current && scope.current === generation && getStoredRuntimeOrigin() === origin
    const load = async () => {
      if (!current() || pending || mutating.current) return
      pending = true
      const epoch = ++readEpoch.current
      try {
        const result = await rpcRequestForOrigin(origin, 'operation.list', { sessionId, limit: 100, ...(unknownOnly ? { state: 'unknown' } : {}) })
        if (current() && !mutating.current && epoch === readEpoch.current) { setItems(result); setError('') }
      } catch (reason) { if (current() && epoch === readEpoch.current) setError(reason instanceof Error ? reason.message : '操作记录读取失败') }
      finally { pending = false }
    }
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [open, unknownOnly, sessionId, origin, refresh])
  async function resolve(item: OperationInfo, decision: 'retry' | 'abandon') {
    if (mutating.current || !valid.current || getStoredRuntimeOrigin() !== origin) return
    const generation = scope.current
    readEpoch.current++
    mutating.current = true; setBusy(item.operationId); setError(''); setNotice('')
    try {
      const result = await rpcRequestForOrigin(origin, 'operation.resolve', { operationId: item.operationId, decision })
      if (valid.current && scope.current === generation && getStoredRuntimeOrigin() === origin) {
        setItems(values => values?.flatMap(value => value.operationId !== result.operationId ? [value] : unknownOnly ? [] : [result]) ?? null)
        setNotice(decision === 'retry' ? '已记录重新尝试的决定；请在核对实际结果后另行发起工具请求。' : '已记录放弃决定；已经发生的外部变化不会撤销。')
      }
    } catch (reason) {
      if (valid.current && scope.current === generation) {
        setItems(null)
        setError(`${reason instanceof Error ? reason.message : '处理失败'}。请刷新记录后再操作。`)
      }
    } finally { mutating.current = false; setBusy('') }
  }
  return <section className="my-3 rounded-lg border p-3 text-sm">
    <JobOutcomeReview key={sessionId} sessionId={sessionId} />
    <InputOutcomeReview key={sessionId} sessionId={sessionId} />
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>工具操作记录与结果审阅</button>
    {open && <div className="mt-3 space-y-3">
      <div className="flex gap-3">
        <label><input type="checkbox" checked={unknownOnly} disabled={Boolean(busy)} onChange={event => setUnknownOnly(event.target.checked)} /> 仅结果未知</label>
        <button type="button" disabled={Boolean(busy)} onClick={() => setRefresh(value => value + 1)}>刷新</button>
      </div>
      <p className="text-xs">显示最近 100 条记录。结果未知表示执行可能已发生，请先核对文件或外部服务；下方决定只更新审阅记录，不立即执行工具。</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!items && !error && <p>读取中…</p>}
      {items?.length === 0 && <p>暂无符合条件的操作。</p>}
      {items?.map(item => <article key={item.operationId} className="space-y-2 border-t pt-2">
        <p className="break-all">{item.toolName} · {labels[item.state] ?? item.state} · {new Date(item.updatedAt).toLocaleString()}</p>
        <p className="break-all text-xs">{item.capability} · {item.resource}</p>
        <details><summary>请求、结果与错误</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{display({ request: item.request, result: item.result, error: item.error })}</pre></details>
        {item.state === 'unknown' && <div className="flex gap-3">
          <button type="button" disabled={Boolean(busy)} onClick={() => void resolve(item, 'retry')}>记录：另行重试</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void resolve(item, 'abandon')}>记录：放弃</button>
        </div>}
      </article>)}
    </div>}
  </section>
}
