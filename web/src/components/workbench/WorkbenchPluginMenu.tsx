import { useEffect, useRef, useState } from 'react'
import { Puzzle, Settings } from 'lucide-react'
import { usePluginUi } from '../plugin-ui/PluginUiProvider'
import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import { pluginSlotTitles } from './plugin-placement'

export function WorkbenchPluginMenu({ onOpen, onManage }: { onOpen: (view: PluginUiLoadedView) => void; onManage?: () => void }) {
  const { views, errors } = usePluginUi()
  const entries = views.filter(view => view.view.slot !== 'tool_card' && !('renderer' in view.view && view.view.renderer === 'editor'))
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape) }
  }, [open])
  return <div className="relative" ref={root}>
    <button type="button" className="workbench-command" aria-label="打开应用扩展" aria-expanded={open} onClick={() => setOpen(value => !value)}><Puzzle size={16} /><span>扩展</span>{errors.length ? '!' : ''}</button>
    {open && <nav className="workbench-extension-menu surface-scrollbars" aria-label="应用扩展">
      {entries.map(view => <button key={view.key} type="button" onClick={() => { onOpen(view); setOpen(false) }}><strong>{view.view.title}</strong><small>{view.module.pluginName} · {pluginSlotTitles[view.view.slot]}</small></button>)}
      {!entries.length && <p className="p-3 text-xs text-text-muted">暂无已启用的界面扩展。</p>}
      {errors.map((error, index) => <p key={index} className="p-3 text-xs text-danger" role="alert">{error}</p>)}
      {!!errors.length && <button type="button" onClick={() => window.dispatchEvent(new Event('edenagent:plugins-retry'))}>重新加载扩展</button>}
      {onManage && <button type="button" onClick={() => { onManage(); setOpen(false) }}><Settings size={15} />插件管理</button>}
    </nav>}
  </div>
}
