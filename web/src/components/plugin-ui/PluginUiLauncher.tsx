import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Blocks, Settings } from 'lucide-react'
import { usePluginUi } from './PluginUiProvider'
import { PluginUiPanel } from './PluginUiPanel'

export function PluginUiLauncher({ toolbar, docked = false, onManage, onOpenView }: {
  toolbar?: HTMLElement | null; docked?: boolean; onManage?: () => void; onOpenView?: () => void
}) {
  const { views, errors } = usePluginUi()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string>()
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 959px)').matches)
  const [menuStyle, setMenuStyle] = useState({ top: 88, right: 16 })
  const button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLElement>(null)
  const entries = views.filter(item => item.view.slot !== 'tool_card' && !('renderer' in item.view && item.view.renderer === 'editor'))
  const active = entries.find(item => item.key === selected)
  const closeView = () => { setSelected(undefined); queueMicrotask(() => button.current?.focus()) }
  useEffect(() => {
    const media = window.matchMedia('(max-width: 959px)')
    const update = () => setNarrow(media.matches)
    media.addEventListener('change', update); update()
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (selected && !entries.some(item => item.key === selected)) setSelected(undefined)
  }, [views, selected])
  useEffect(() => {
    const close = () => { setOpen(false); setSelected(undefined) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) close() }
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('edenagent:plugins-close-view', close)
    document.addEventListener('pointerdown', outside)
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('edenagent:plugins-close-view', close)
      document.removeEventListener('pointerdown', outside)
    }
  }, [])
  useLayoutEffect(() => {
    if (!open) return
    const position = () => {
      const rect = button.current?.getBoundingClientRect()
      if (rect) setMenuStyle({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) })
    }
    position(); window.addEventListener('resize', position)
    return () => window.removeEventListener('resize', position)
  }, [open])
  if ((!entries.length && !errors.length && !onManage) || typeof document === 'undefined') return null
  const trigger = <button ref={button} type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label="打开应用扩展"
    className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-text-muted hover:bg-surface-hover hover:text-text">
    <Blocks className="h-4 w-4" /><span>扩展</span>{errors.length > 0 && <span className="text-warning">!</span>}
  </button>
  return <>
    {toolbar ? createPortal(trigger, toolbar) : toolbar === undefined && createPortal(<div className="fixed right-4 top-12 z-[80] rounded-lg border border-border bg-card p-1 shadow-sm">{trigger}</div>, document.body)}
    {open && createPortal(<nav ref={menu} aria-label="应用扩展" style={{ ...menuStyle, maxHeight: `calc(100vh - ${menuStyle.top + 12}px)` }}
      className="surface-scrollbars fixed z-[90] w-[min(18rem,calc(100vw-1rem))] overflow-auto rounded-xl border border-border bg-card p-2 text-text shadow-xl">
      {entries.map(item => <button key={item.key} type="button" onClick={() => { onOpenView?.(); setSelected(item.key); setOpen(false) }}
        className="block w-full rounded-lg p-3 text-left text-sm hover:bg-surface-hover">
        <span className="block font-medium">{item.view.title}</span><span className="text-xs text-text-muted">{item.module.pluginName}</span>
      </button>)}
      {!entries.length && !errors.length && <p className="p-3 text-xs text-text-muted">暂无已启用的界面扩展，可在插件管理中审查并启用。</p>}
      {errors.map((error, index) => <p key={index} role="alert" className="p-3 text-xs text-danger">{error}</p>)}
      {errors.length > 0 && <button type="button" onClick={() => window.dispatchEvent(new Event('edenagent:plugins-retry'))}
        className="w-full rounded-lg p-3 text-left text-sm hover:bg-surface-hover">重试加载扩展</button>}
      {onManage && <button type="button" onClick={() => { setOpen(false); onManage() }} className="flex w-full items-center gap-2 rounded-lg border-t border-border p-3 text-left text-sm hover:bg-surface-hover"><Settings className="h-4 w-4" />插件管理</button>}
    </nav>, document.body)}
    {active && <PluginUiPanel view={active} mode={active.view.slot === 'page' ? 'page' : docked && !narrow ? 'dock' : 'drawer'} onClose={closeView} />}
  </>
}
