import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, X } from 'lucide-react'
import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import { PluginUiView } from './PluginUiSlot'

export function PluginUiPanel({ view, mode, onClose }: {
  view: PluginUiLoadedView; mode: 'dock' | 'drawer' | 'page'; onClose: () => void
}) {
  const slot = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const [mount] = useState(() => {
    if (typeof document === 'undefined') return null
    const element = document.createElement('div')
    element.className = 'plugin-ui-panel-mount interface-dark'
    return element
  })
  const modal = mode !== 'dock'
  useLayoutEffect(() => {
    if (!mount) return
    const target = mode === 'dock' ? slot.current : document.body
    if (!target) return
    const theme = getComputedStyle(slot.current?.closest('.theme-page') ?? document.documentElement)
    for (const name of Array.from(theme)) {
      if (/^--(?:interface-|color-|font-)/.test(name)) mount.style.setProperty(name, theme.getPropertyValue(name))
    }
    target.appendChild(mount)
    return () => mount.remove()
  }, [mount, mode])
  useEffect(() => {
    if (!modal || !mount) return
    const workspace = slot.current?.closest<HTMLElement>('.chat-workspace')
    const wasInert = workspace?.inert ?? false
    if (workspace) workspace.inert = true
    if (!mount.contains(document.activeElement)) close.current?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !mount.contains(document.activeElement)) return
      const elements = [...mount.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0)
      const target = event.shiftKey && document.activeElement === elements[0] ? elements.at(-1)
        : !event.shiftKey && document.activeElement === elements.at(-1) ? elements[0] : undefined
      if (target) { event.preventDefault(); target.focus() }
    }
    window.addEventListener('keydown', trap)
    return () => { if (workspace) workspace.inert = wasInert; window.removeEventListener('keydown', trap) }
  }, [modal, mount, view.key])
  return <>
    <div ref={slot} className={mode === 'dock' ? 'plugin-ui-dock-slot' : 'hidden'} />
    {modal && createPortal(<div className="fixed inset-0 z-[60] bg-scrim/30" aria-hidden="true" onClick={onClose} />, document.body)}
    {mount && createPortal(<section className="plugin-ui-panel" data-presentation={mode}
      role={modal ? 'dialog' : 'complementary'} aria-modal={modal || undefined} aria-label={view.view.title}>
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <button ref={close} type="button" aria-label={mode === 'page' ? '返回聊天' : '关闭扩展面板'} onClick={onClose}
          className="rounded-lg p-2 hover:bg-surface-hover">{mode === 'page' ? <ArrowLeft className="h-4 w-4" /> : <X className="h-4 w-4" />}</button>
        <h2 className="min-w-0 flex-1 truncate font-medium">{view.view.title}</h2>
      </header>
      <div className="surface-scrollbars min-h-0 flex-1 overflow-auto">
        <PluginUiView key={`${view.key}:${view.module.revision}`} view={view} />
      </div>
    </section>, mount)}
  </>
}
