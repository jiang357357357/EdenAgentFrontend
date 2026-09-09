import type { McpStatus as Status, McpOperationHistory as History } from '@eden/api'
import { useEffect, useState } from 'react'
import { McpResult } from './McpResult'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
const labels: Record<string, string> = { running: '等待结果', completed: '已确认', failed: '失败', unknown: '结果未知' }
export function McpPanel({ sessionId, pluginId }: { sessionId?: string; pluginId?: string }) {
  const [open, setOpen] = useState(false), [status, setStatus] = useState<Status | null>(null)
  const [history, setHistory] = useState<History | null>(null), [error, setError] = useState('')
  const [before, setBefore] = useState<number | undefined>(), [refresh, setRefresh] = useState(0)
  const origin = getStoredRuntimeOrigin()
  useEffect(() => { setBefore(undefined) }, [sessionId, pluginId, origin])
  useEffect(() => {
    setStatus(null); setHistory(null); setError('')
    if (!open) return
    let active = true, pending = false
    const load = async () => {
      if (pending) return
      pending = true
      try {
        const [nextStatus, nextHistory] = await Promise.all([
          rpcRequestForOrigin(origin, 'mcp.status', {}),
          sessionId ? rpcRequestForOrigin(origin, 'mcp.operations', { sessionId, ...(before === undefined ? {} : { before }) }) : Promise.resolve(null),
        ])
        if (active && getStoredRuntimeOrigin() === origin) { setStatus(nextStatus); setHistory(nextHistory); setError('') }
      } catch { if (active) setError('MCP 状态读取失败，请刷新。') }
      finally { pending = false }
    }
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [open, sessionId, pluginId, origin, before, refresh])
  const runtimes = status?.runtimes.filter(item => !pluginId || item.pluginId === pluginId) ?? []
  const errors = status?.errors.filter(item => !pluginId || item.id === pluginId || item.id.startsWith(`${pluginId}:`)) ?? []
  return <section className="my-3 rounded-lg border p-3 text-sm">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>MCP 运行与调用记录</button>
    {open && <div className="mt-3 space-y-2">
      <button type="button" onClick={() => setRefresh(value => value + 1)}>刷新</button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!status && !error && <p>读取中…</p>}
      {status && !runtimes.length && <p>暂无已连接的 MCP 运行时。</p>}
      {runtimes.map(item => <div key={item.id} className="break-all border-t pt-2">
        <p>{item.pluginId} / {item.componentId} · 已连接 · {item.kind}</p>
        <p className="text-xs text-stone-500">{item.server.name} {item.server.version} · 包版本 {item.revision.slice(0, 12)}</p>
      </div>)}
      {errors.map(item => <p key={item.id} className="break-all text-red-700">{item.id}：{item.error}</p>)}
      {history && <>
        {!history.items.length && <p>当前会话暂无 MCP 调用记录。</p>}
        {history.items.some(item => item.state === 'unknown') && <p className="text-amber-800">结果未知的操作可能已经在远端执行，请先核对远端状态。</p>}
        <ul>{history.items.map(item => <li key={item.id} className="break-all border-t py-2">
          <p>{item.name} · {labels[item.state] ?? item.state}</p>
          <p className="text-xs text-stone-500">{item.runtimeId} · {new Date(item.updatedAt).toLocaleString()}</p>
          {item.error && <p>{item.error}</p>}
          {sessionId && <McpResult sessionId={sessionId} operationId={item.id} state={item.state} />}
        </li>)}</ul>
        {before !== undefined && <button type="button" onClick={() => setBefore(undefined)}>最新记录</button>}
        {history.nextCursor !== null && <button type="button" className="ml-3" onClick={() => setBefore(history.nextCursor!)}>更早记录</button>}
      </>}
    </div>}
  </section>
}
