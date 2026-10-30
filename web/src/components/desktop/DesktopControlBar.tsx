import { useEffect, useRef, useState } from 'react'
import { Monitor, Pause, Play, Square } from 'lucide-react'
import type { DesktopStatus } from '@eden/api'
import { useScopedRpc } from '../../lib/use-scoped-rpc'
import { noticeActionClass } from '../feedback'

export function DesktopControlBar() {
  if (window.edenAgentDesktop?.desktopControlWindow) return null
  return <BrowserDesktopControlBar />
}

function BrowserDesktopControlBar() {
  const rpc = useScopedRpc()
  const [status, setStatus] = useState<DesktopStatus | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const revision = useRef(0)
  const controlling = useRef(false)
  useEffect(() => {
    let current = true, timer: ReturnType<typeof setTimeout> | undefined
    let loading = false
    async function load() {
      if (!current || loading) return
      loading = true
      const captured = revision.current
      try {
        if (!controlling.current) {
          const value = await rpc('desktop.status', {})
          if (current && captured === revision.current) { setStatus(value); setError('') }
        }
      }
      catch { /* Connection feedback owns idle transport errors; explicit control errors remain visible. */ }
      finally {
        loading = false
        if (current) timer = setTimeout(() => { void load() }, 1000)
      }
    }
    const visibility = () => { if (document.visibilityState === 'visible') { if (timer) clearTimeout(timer); void load() } }
    document.addEventListener('visibilitychange', visibility)
    void load()
    return () => { current = false; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [rpc])
  async function control(action: 'pause' | 'resume' | 'stop') {
    if (controlling.current) return
    controlling.current = true; revision.current++
    setPending(true)
    try { setStatus(await rpc('desktop.control', { action })); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : '桌面控制暂不可用') }
    finally { controlling.current = false; setPending(false) }
  }
  if (!status?.available || (!status.busy && !status.operations.length && !status.paused && !status.stopped && !error)) return null
  const operation = status.operations.find(item => item.state === 'running') ?? status.operations[0]
  const paused = status.paused || status.stopped
  return <aside aria-label="桌面控制" className="fixed bottom-5 left-1/2 z-[110] flex w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-card px-4 py-3 text-text shadow-xl">
    <Monitor size={18} className="shrink-0 text-accent" />
    <div className="min-w-0 flex-1" role="status" aria-live="polite">
      <p className="text-sm font-medium">{status.stopped ? '桌面控制已停止' : status.paused ? '桌面控制已暂停' : '智能体正在操作桌面'}</p>
      <p className="max-w-72 truncate text-xs text-text-muted" title={status.control?.message}>{error || (paused ? status.control?.message || '暂停／停止来源未记录，恢复后需重新观察' : operation?.windowTitle || '正在查找或切换应用窗口')}</p>
      <p className="whitespace-nowrap text-xs text-text-muted">Ctrl + Alt + F12 随时停止</p>
    </div>
    <div className="flex w-full justify-end gap-2 sm:w-auto">
    <button type="button" disabled={pending} className={noticeActionClass} onClick={() => void control(paused ? 'resume' : 'pause')}>
      {paused ? <Play size={14} /> : <Pause size={14} />}{paused ? '恢复' : '暂停'}
    </button>
    {!status.stopped && <button type="button" disabled={pending} className={noticeActionClass} onClick={() => void control('stop')}><Square size={14} />停止</button>}
    </div>
  </aside>
}
