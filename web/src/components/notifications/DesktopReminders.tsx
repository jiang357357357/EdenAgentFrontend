import { useEffect, useRef, useState } from 'react'
import type { DesktopReminder } from '@eden/api'
import type { RuntimeOrigin } from '../../lib/runtime-origin'
import { listDesktopReminders, displayDesktopReminder, closeDesktopReminder } from '../../lib/desktop-reminders'
import { NoticeCard, noticeActionClass } from '../feedback'

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
  if (!items.length && !error) return null
  return <aside aria-label="角色提醒" className="fixed bottom-5 right-5 z-[90] flex max-h-[70vh] w-80 flex-col gap-3 overflow-auto">
    {error && <NoticeCard tone="error" title="提醒暂不可用" description={error} />}
    {items.slice(0, 3).map(item => <NoticeCard key={item.id} title={item.title} description={item.message}
      busy={pending === item.id} className="shadow-xl"
      actions={<button type="button" disabled={pending !== null} onClick={() => void close(item.id)} className={noticeActionClass}>知道了</button>}>
      <time className="text-xs text-text-muted" dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString()}</time>
    </NoticeCard>)}
    {items.length > 3 && <span className="text-right text-xs text-text-muted">还有 {items.length - 3} 条提醒</span>}
  </aside>
}
