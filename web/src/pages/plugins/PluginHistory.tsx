import { useState } from 'react'
import type { PluginDiffResult, PluginLogPage } from '@eden/api'
import { usePluginDevelopment, type PluginVersionSummary } from '../../lib/plugin-development'
export function PluginHistory({ id, versions }: { id: string; versions: PluginVersionSummary[] }) {
  const api = usePluginDevelopment()
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [diff, setDiff] = useState<PluginDiffResult | null>(null)
  const [logs, setLogs] = useState<PluginLogPage | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function run(work: () => Promise<void>) {
    setBusy(true); setError('')
    try { await work() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  return <details className="mt-4 border-t pt-3 text-xs">
    <summary className="cursor-pointer font-medium">版本差异与运行记录 · {id}</summary>
    <div className="mt-3 flex flex-wrap gap-2">
      {[['原版本', from, setFrom], ['目标版本', to, setTo]].map(([label, value, setter]) => <select key={label as string} aria-label={label as string} value={value as string}
        onChange={event => (setter as (value: string) => void)(event.target.value)} className="rounded border p-2">
        <option value="">{label as string}</option>{versions.map(version => <option key={version.revision} value={version.revision}>{version.version} · {version.revision.slice(0, 10)}</option>)}
      </select>)}
      <button disabled={busy || !from || !to} onClick={() => void run(async () => setDiff(await api.diff(id, from, to)))} className="rounded border px-3 disabled:opacity-40">对比</button>
      <button disabled={busy} onClick={() => void run(async () => setLogs(await api.logs(id)))} className="rounded border px-3">刷新运行记录</button>
    </div>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {diff && <div className="mt-3 grid gap-3 lg:grid-cols-2">{(['manifest', 'source'] as const).map(key => <div key={key}>
      <b>{key === 'manifest' ? '清单' : '源码'}{diff[key].changed ? ` · 从第 ${diff[key].startLine} 行开始变化` : ' · 无变化'}</b>
      <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2">
        {diff[key].removed.map((line, index) => <span key={`r${index}`} className="block bg-red-50 text-red-800">- {line}</span>)}
        {diff[key].added.map((line, index) => <span key={`a${index}`} className="block bg-emerald-50 text-emerald-800">+ {line}</span>)}
      </pre>
    </div>)}</div>}
    {logs && <div className="mt-3 space-y-2">
      {!logs.items.length && <p className="text-stone-500">暂无运行记录</p>}
      {logs.items.map(item => <div key={item.seq} className="rounded bg-stone-50 p-2">
        <b>{item.action} · {item.state}</b><span className="ml-2">{new Date(item.startedAt).toLocaleString()}</span>
        <div className="text-stone-500">{item.revision?.slice(0, 12) ?? '版本未确定'}{item.finishedAt === null ? '' : ` · ${item.finishedAt - item.startedAt} ms`}{item.errorCode ? ` · ${item.errorCode}` : ''}</div>
      </div>)}
      {logs.hasMore && logs.nextCursor !== null && <button disabled={busy} onClick={() => void run(async () => { const page = await api.logs(id, logs.nextCursor!); setLogs({ ...page, items: [...logs.items, ...page.items] }) })}>加载更早记录</button>}
    </div>}
  </details>
}
