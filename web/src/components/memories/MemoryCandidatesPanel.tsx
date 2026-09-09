import { useEffect, useRef, useState } from 'react'
import type { MemoryCandidateView, MemoryCandidatesPage } from '@eden/api'
import { listMemoryCandidates, resumeMemoryCandidates } from '../../lib/memory-candidates'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

const kindLabel = { preference: '偏好', fact: '事实', decision: '决定', procedure: '流程' }

export function MemoryCandidatesPanel({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState(getStoredRuntimeOrigin)
  const [cursor, setCursor] = useState<string | undefined>()
  const [page, setPage] = useState<MemoryCandidatesPage>({ items: [], nextCursor: null })
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const epoch = useRef(0)

  useEffect(() => {
    const changed = () => {
      epoch.current++
      setOrigin(getStoredRuntimeOrigin()); setOpen(false); setPage({ items: [], nextCursor: null })
      setCursor(undefined); setError(''); setNotice(''); setPending(null)
    }
    window.addEventListener('edenagent:runtime-origin-changed', changed)
    window.addEventListener('storage', changed)
    return () => { epoch.current++; window.removeEventListener('edenagent:runtime-origin-changed', changed); window.removeEventListener('storage', changed) }
  }, [])

  useEffect(() => {
    const current = ++epoch.current
    setPending(null)
    if (!open || !origin) return
    setLoading(true); setError('')
    void listMemoryCandidates(origin, sessionId, cursor).then(result => {
      if (current === epoch.current) setPage(result)
    }).catch(reason => {
      if (current === epoch.current) { setPage({ items: [], nextCursor: null }); setError(String(reason instanceof Error ? reason.message : reason)) }
    }).finally(() => { if (current === epoch.current) setLoading(false) })
    return () => { epoch.current++ }
  }, [open, origin, sessionId, cursor, refresh])

  async function resume(item: MemoryCandidateView) {
    if (!origin || pending) return
    const current = epoch.current
    setPending(item.id); setError(''); setNotice('')
    try {
      await resumeMemoryCandidates(origin, { sessionId, jobId: item.id, revision: item.revision })
      if (current !== epoch.current) return
      setNotice('已请求审批，请在对话中的权限卡片确认。完成后可刷新查看。')
      setRefresh(value => value + 1)
    } catch (reason) {
      if (current === epoch.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally { if (current === epoch.current) setPending(null) }
  }

  return <div className="relative">
    <button type="button" aria-expanded={open} onClick={() => { setOpen(value => !value); setCursor(undefined) }}
      className="h-8 rounded px-2 text-xs text-text-muted hover:bg-card hover:text-text">记忆候选</button>
    {open && <section aria-label="当前会话记忆候选" className="absolute right-0 top-10 z-50 max-h-[65vh] w-[min(24rem,85vw)] overflow-y-auto rounded-lg border border-border bg-bg p-4 text-sm text-text shadow-xl"
      onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
      <div className="mb-2 flex items-center justify-between"><strong>待保存的记忆</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="关闭记忆候选">关闭</button></div>
      <p className="mb-3 text-xs text-text-muted">候选尚未成为长期记忆。重新审批后，由你决定是否保存。</p>
      {error && <p role="alert" className="mb-2 text-red-500">{error}</p>}
      {notice && <p role="status" className="mb-2 text-xs text-text-muted">{notice}</p>}
      {loading ? <p role="status">正在读取…</p> : page.items.length ? page.items.map(item => <article key={item.id} className="mb-3 rounded border border-border p-3">
        <p className="mb-2 text-xs text-text-muted">角色 {item.actorId || item.scopeKey} · {new Date(item.createdAt).toLocaleString()}</p>
        <ul className="space-y-2">{item.candidates.map((candidate, index) => <li key={index}>
          <span className="mr-2 text-xs text-text-muted">{kindLabel[candidate.kind]}</span>{candidate.content}
        </li>)}</ul>
        <button type="button" disabled={item.processing || pending !== null} onClick={() => void resume(item)}
          className="mt-3 rounded border border-border px-3 py-1 disabled:opacity-50">
          {item.processing ? '等待处理或审批' : pending === item.id ? '正在请求…' : '重新审批'}
        </button>
      </article>) : <p className="text-text-muted">当前没有待保存的候选。</p>}
      <div className="mt-3 flex gap-3 text-xs">
        <button type="button" disabled={loading || pending !== null} onClick={() => setRefresh(value => value + 1)}>刷新</button>
        {cursor && <button type="button" disabled={loading || pending !== null} onClick={() => setCursor(undefined)}>返回首页</button>}
        {page.nextCursor && <button type="button" disabled={loading || pending !== null} onClick={() => setCursor(page.nextCursor!)}>下一页</button>}
      </div>
    </section>}
  </div>
}
