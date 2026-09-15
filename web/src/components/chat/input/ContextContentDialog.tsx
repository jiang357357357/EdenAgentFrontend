import { useEffect, useState } from 'react'
import { SessionPanelDialog } from '../SessionPanelDialog'
import { useScopedRpc } from '../../../lib/use-scoped-rpc'
import type { RpcMethodMap } from '../../../lib/rpc-contracts'

type Request = RpcMethodMap['session.context']['result']['requests'][number]
import { contextObject as object, contextText as display, contextSections } from '../../../lib/context-sections'

export function ContextContentDialog({ sessionId, draft, onClose }: { sessionId?: string; draft: string; onClose: () => void }) {
  const rpc = useScopedRpc()
  const [requests, setRequests] = useState<Request[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let live = true
    setLoading(true); setError(''); setRequests([])
    if (!sessionId) { setLoading(false); return }
    void rpc('session.context', { sessionId }).then(result => {
      if (live) { setRequests(result.requests); setSelected(result.requests[0]?.id ?? '') }
    }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : '读取上下文失败') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [sessionId, rpc, revision])
  const request = requests.find(item => item.id === selected)
  const snapshot = object(request?.payload)
  const payload = object(snapshot.payload)
  const sections = contextSections(snapshot)
  return <SessionPanelDialog title="当前上下文" onClose={onClose}>
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-text-muted">展示最近一次模型请求中的上下文。未发送的输入单独列出；后续回复和修改会在下一次请求中体现。</p>
        <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="shrink-0 rounded border border-border px-3 py-1 disabled:opacity-50">刷新</button>
      </div>
      {loading && <p role="status">正在读取上下文…</p>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!loading && !error && requests.length === 0 && <p>尚无模型请求，发送消息后可查看实际上下文。</p>}
      {requests.length > 1 && <label className="block">角色请求
        <select className="ml-2 rounded border border-border bg-card p-2" value={selected} onChange={event => setSelected(event.target.value)}>
          {requests.map(item => { const data = object(item.payload), actor = object(data.actor); return <option key={item.id} value={item.id}>{String(actor.assistantName ?? actor.assistantID ?? '默认角色')} · {String(data.model ?? '')}</option> })}
        </select>
      </label>}
      {request && <>
        <p className="text-text-muted">{String(snapshot.model ?? '')} · {new Date(request.createdAt).toLocaleString()}</p>
        {sections.map(section => <section key={section.title} className="space-y-2">
          <h3 className="border-l-2 border-accent pl-2 font-medium">{section.title} <span className="text-xs text-text-muted">{section.items.length} 项</span></h3>
          {section.items.map((item, index) => <Content key={`${selected}:${section.title}:${index}`} title={item.title} value={item.value} />)}
        </section>)}
        <Content title="完整请求内容" value={payload} />
      </>}
      {draft && <Content title="当前输入文字（未发送）" value={draft} />}
    </div>
  </SessionPanelDialog>
}

function Content({ title, value }: { title: string; value: unknown }) {
  const text = display(value)
  const length = Array.from(text).length
  return <details className="rounded-lg border border-border p-3">
    <summary className="cursor-pointer font-medium"><span>{title}</span><span className="ml-2 text-xs font-normal text-text-muted">{length.toLocaleString()} 字符</span><span className="mt-1 block truncate text-xs font-normal text-text-muted">{text.replace(/\s+/g, ' ').slice(0, 120) || '空内容'}</span></summary>
    <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed [overflow-wrap:anywhere]">{text}</pre>
  </details>
}
