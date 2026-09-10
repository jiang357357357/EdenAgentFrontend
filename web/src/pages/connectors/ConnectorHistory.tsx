import type { ConnectorEventPage, ConnectorOperationPage } from '@eden/api'
import { useEffect, useRef, useState } from 'react'
import type { JsonValue } from '../../generated/eden-agent-rpc'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
type HistoryItem = Partial<ConnectorEventPage['items'][number] & ConnectorOperationPage['items'][number]> & { id: string; createdAt: number }
type HistoryPage = { items: HistoryItem[]; nextCursor: number | null }
const labels: Record<string, string> = { running: '调用中', completed: '已返回', failed: '明确失败', unknown: '结果未确认', self_awake_rate_limited: '自唤醒频率限制', bound_session_closed: '绑定会话已关闭' }
export function ConnectorHistory({ id }: { id: string }) {
  const [tab, setTab] = useState<'events' | 'operations'>('events'), [page, setPage] = useState<HistoryPage | null>(null)
  const [open, setOpen] = useState(false), [before, setBefore] = useState<number | undefined>(), [refresh, setRefresh] = useState(0)
  const [error, setError] = useState(''), [detail, setDetail] = useState<{ id: string; payload: JsonValue } | null>(null)
  const epoch = useRef(0), detailRequest = useRef(0), origin = getStoredRuntimeOrigin()
  useEffect(() => {
    const current = ++epoch.current
    setPage(null); setDetail(null); setError('')
    if (!open) return
    void rpcRequestForOrigin(origin, tab === 'events' ? 'connector.events' : 'connector.operations', { id, ...(before === undefined ? {} : { before }) })
      .then(result => { if (epoch.current === current) setPage({ ...result, nextCursor: result.nextCursor ?? null }) }, reason => { if (epoch.current === current) setError(String(reason)) })
    return () => { epoch.current++ }
  }, [id, origin, tab, before, refresh, open])
  async function inspect(eventId: string) {
    const current = epoch.current, request = ++detailRequest.current
    try {
      const result = await rpcRequestForOrigin(origin, 'connector.event.read', { id, eventId })
      if (epoch.current === current && detailRequest.current === request) setDetail(result)
    } catch (reason) { if (epoch.current === current) setError(String(reason)) }
  }
  return <section className="my-3 rounded-xl border bg-white p-3 text-sm">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>事件与调用记录</button>
    {open && <div className="mt-3 space-y-2">
      <div className="flex gap-3">{(['events', 'operations'] as const).map(value => <button type="button" key={value} aria-pressed={tab === value}
        onClick={() => { setTab(value); setBefore(undefined) }}>{value === 'events' ? '事件' : '调用'}</button>)}
        <button type="button" onClick={() => setRefresh(value => value + 1)}>刷新</button></div>
      {error && <p role="alert">{error}</p>}
      {page?.items.length === 0 && <p>暂无记录</p>}
      <ul>{page?.items.map(item => <li className="border-t py-2" key={item.id}>
        <p>{item.eventType ?? item.method} · {new Date(item.createdAt).toLocaleString()}</p>
        {item.state && <p>{labels[item.state] ?? item.state}</p>}
        {item.jobId && <p className="break-all">自唤醒作业：{item.jobId}</p>}
        {item.suppression && <p>{labels[item.suppression] ?? item.suppression}</p>}
        {item.error && <p>{item.error}</p>}
        {tab === 'events' && <button type="button" onClick={() => void inspect(item.id)}>查看事件内容</button>}
      </li>)}</ul>
      {detail && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-stone-50 p-2 text-xs">{JSON.stringify(detail.payload, null, 2)}</pre>}
      {tab === 'operations' && <p className="text-xs text-stone-500">结果未确认的调用可能已产生外部影响，请先核对游戏或服务状态。</p>}
      {before !== undefined && <button type="button" onClick={() => setBefore(undefined)}>最新记录</button>}
      {page?.nextCursor != null && <button type="button" onClick={() => setBefore(page.nextCursor!)}>更早记录</button>}
    </div>}
  </section>
}
