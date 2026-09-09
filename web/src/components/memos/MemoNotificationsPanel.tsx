import { useEffect, useRef, useState } from 'react'
import type { MemoNotification } from '@eden/api'
import { listMemoNotifications, acknowledgeMemoNotification } from '../../lib/memo-notifications'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function MemoNotificationsPanel() {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState(getStoredRuntimeOrigin)
  const [items, setItems] = useState<MemoNotification[]>([])
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [pending, setPending] = useState<string | null>(null)
  const epoch = useRef(0)
  useEffect(() => {
    const changed = () => { epoch.current++; setOrigin(getStoredRuntimeOrigin()); setItems([]); setError(''); setPending(null); setOpen(false) }
    window.addEventListener('edenagent:runtime-origin-changed', changed)
    window.addEventListener('storage', changed)
    return () => { epoch.current++; window.removeEventListener('edenagent:runtime-origin-changed', changed); window.removeEventListener('storage', changed) }
  }, [])
  useEffect(() => {
    const current = ++epoch.current
    setPending(null)
    if (!origin) return
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try { const result = await listMemoNotifications(origin); if (epoch.current === current) { setItems(result); setError('') } }
      catch (reason) { if (epoch.current === current) setError(reason instanceof Error ? reason.message : String(reason)) }
      if (epoch.current === current) timer = setTimeout(() => { void load() }, 15000)
    }
    void load()
    return () => { epoch.current++; clearTimeout(timer) }
  }, [origin, refresh])
  async function acknowledge(id: string) {
    if (!origin || pending) return
    const current = epoch.current
    setPending(id)
    try {
      await acknowledgeMemoNotification(origin, id)
      if (current === epoch.current) setRefresh(value => value + 1)
    } catch (reason) { if (current === epoch.current) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { if (current === epoch.current) setPending(null) }
  }
  const unread = items.filter(item => item.readAt === null).length
  return <div className="relative">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="rounded-full border border-stone-200 bg-white/70 px-4 py-2 text-sm text-text">
      到期提醒{unread ? ` (${unread})` : ''}
    </button>
    {open && <section aria-label="到期提醒" className="absolute right-0 top-12 z-50 max-h-[60vh] w-80 overflow-y-auto rounded-xl border border-border bg-bg p-4 text-sm text-text shadow-xl">
      <div className="mb-3 flex justify-between"><strong>提醒收件箱</strong><button type="button" onClick={() => setOpen(false)}>关闭</button></div>
      {error && <p role="alert" className="mb-2 text-red-500">{error}</p>}
      {!items.length && !error && <p className="text-text-muted">暂无到期提醒</p>}
      {items.map(item => <article key={item.id} className="mb-3 border-b border-border pb-3">
        <p className="font-medium">{item.memo.title}</p><p className="whitespace-pre-wrap break-words">{item.memo.content}</p>
        <p className="mt-1 text-xs text-text-muted">{new Date(item.createdAt).toLocaleString()}</p>
        {item.readAt === null ? <button type="button" disabled={pending !== null} onClick={() => void acknowledge(item.id)} className="mt-2 rounded border border-border px-2 py-1">知道了</button> : <span className="text-xs text-text-muted">已读</span>}
      </article>)}
    </section>}
  </div>
}
