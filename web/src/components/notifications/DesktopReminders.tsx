import { useEffect, useRef, useState } from 'react'
import type { DesktopReminder } from '@eden/api'
import type { RuntimeOrigin } from '../../lib/runtime-origin'
import { listDesktopReminders, displayDesktopReminder, closeDesktopReminder } from '../../lib/desktop-reminders'

export function DesktopReminders({ origin }: { origin: RuntimeOrigin }) {
  const [items, setItems] = useState<DesktopReminder[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [visible, setVisible] = useState(document.visibilityState === 'visible')
  const active = useRef(true)
  const displaying = useRef(new Set<string>())
  useEffect(() => {
    active.current = true
    const visibility = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', visibility)
    let timer: ReturnType<typeof setTimeout>
    async function load() {
      try { const result = await listDesktopReminders(origin); if (active.current) { setItems(result); setError('') } }
      catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : String(reason)) }
      if (active.current) timer = setTimeout(() => { void load() }, 5000)
    }
    void load()
    return () => { active.current = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [origin])
  useEffect(() => {
    if (!visible) return
    for (const item of items.slice(0, 3)) {
      if (item.state !== 'pending' || displaying.current.has(item.id)) continue
      displaying.current.add(item.id)
      void displayDesktopReminder(origin, item.id).then(result => {
        if (active.current) setItems(current => current.map(value => value.id === result.id ? result : value))
      }).catch(reason => { if (active.current) setError(String(reason)) }).finally(() => displaying.current.delete(item.id))
    }
  }, [items, origin, visible])
  async function close(id: string) {
    if (pending) return
    setPending(id)
    try { await closeDesktopReminder(origin, id); if (active.current) setItems(current => current.filter(item => item.id !== id)) }
    catch (reason) { if (active.current) setError(String(reason)) }
    finally { if (active.current) setPending(null) }
  }
  if (!items.length) return null
  return <aside aria-label="角色提醒" className="fixed bottom-5 right-5 z-[90] flex max-h-[70vh] w-80 flex-col gap-3 overflow-auto">
    {error && <p role="alert" className="rounded-lg bg-bg p-2 text-sm text-red-500">{error}</p>}
    {items.slice(0, 3).map(item => <section key={item.id} className="rounded-xl border border-border bg-bg p-4 text-text shadow-xl">
      <h2 className="font-medium">{item.title}</h2>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.message}</p>
      <div className="mt-3 flex items-center justify-between text-xs text-text-muted"><span>{new Date(item.createdAt).toLocaleString()}</span>
        <button type="button" disabled={pending !== null} onClick={() => void close(item.id)} className="rounded border border-border px-3 py-1">知道了</button></div>
    </section>)}
    {items.length > 3 && <span className="text-right text-xs text-text-muted">还有 {items.length - 3} 条提醒</span>}
  </aside>
}
