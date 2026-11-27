import { useEffect, useRef } from 'react'
import { Puzzle, Settings } from 'lucide-react'
import { usePluginUi } from '../plugin-ui/PluginUiProvider'
import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import { pluginSlotTitles } from './plugin-placement'

export type PluginMenuMode = 'all' | 'sidebar' | null

export function WorkbenchPluginMenu({ mode, onModeChange, onOpen, onManage }: {
  mode: PluginMenuMode; onModeChange(mode: PluginMenuMode): void
  onOpen(view: PluginUiLoadedView): void; onManage?: () => void
}) {
  const { views, errors } = usePluginUi()
  const entries = views.filter(({ view }) => mode === 'sidebar'
    ? view.slot === 'sidebar_panel'
    : view.slot !== 'tool_card' && !('renderer' in view && view.renderer === 'editor'))
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!mode) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[aria-controls="workbench-extension-menu"]')) return
      if (!root.current?.contains(event.target as Node)) onModeChange(null)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onModeChange(null) }
    document.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape) }
  }, [mode, onModeChange])
  return <div className={mode === 'sidebar' ? undefined : 'relative'} ref={root}>
    <button type="button" className="workbench-command" aria-label="打开应用扩展" aria-controls="workbench-extension-menu" aria-expanded={mode === 'all'} onClick={() => onModeChange(mode === 'all' ? null : 'all')}><Puzzle size={16} /><span>扩展</span>{errors.length ? '!' : ''}</button>
    {mode && <nav id="workbench-extension-menu" className="workbench-extension-menu surface-scrollbars" data-mode={mode} aria-label={mode === 'sidebar' ? '工具侧栏扩展' : '应用扩展'}>
      {entries.map(view => <button key={view.key} type="button" onClick={() => { onOpen(view); onModeChange(null) }}><strong>{view.view.title}</strong><small>{view.module.pluginName} · {pluginSlotTitles[view.view.slot]}</small></button>)}
      {!entries.length && <p className="p-3 text-xs text-text-muted">{mode === 'sidebar' ? '暂无已启用的侧栏扩展。' : '暂无已启用的界面扩展。'}</p>}
      {errors.map((error, index) => <p key={index} className="p-3 text-xs text-danger" role="alert">{error}</p>)}
      {!!errors.length && <button type="button" onClick={() => window.dispatchEvent(new Event('edenagent:plugins-retry'))}>重新加载扩展</button>}
      {onManage && <button type="button" onClick={() => { onManage(); onModeChange(null) }}><Settings size={15} />插件管理</button>}
    </nav>}
  </div>
}
