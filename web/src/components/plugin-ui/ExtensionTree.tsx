import { useContext, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { extensionTreeItemSchema, type ExtensionTreeItem } from '@eden/api'
import type { PluginUiHost } from '@eden/plugin-sdk/ui'
import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import { invokeExtension } from '../../lib/extensions/extension-invocation'
import { usePluginUi } from './PluginUiProvider'
import { ExtensionContributionContext, useExtensionWorkbenchActions } from './ExtensionWorkbenchContext'
import { matchesContribution } from '../../lib/extensions/contribution-context'
import { extensionViewActions } from './extension-view-actions'

export function ExtensionTree({ view, host }: { view: PluginUiLoadedView; host: PluginUiHost }) {
  const { origin } = usePluginUi(), base = useExtensionWorkbenchActions()
  const [nodes, setNodes] = useState<Record<string, ExtensionTreeItem[]>>({}), [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  const [menu, setMenu] = useState<{ item: ExtensionTreeItem; x: number; y: number }>()
  const context = useContext(ExtensionContributionContext), epoch = useRef(0), loaders = useRef(new Map<string, AbortController>())
  useEffect(() => view.extension!.onView(event => {
    if (event.scope && event.scope.sessionId !== host.sessionId) return
    if ((event.type === 'refresh' || event.type === 'configuration') && event.viewId === view.view.id) setRevision(value => value + 1)
  }), [view, host.sessionId])
  const actions = extensionViewActions(view, base, host.sessionId)
  async function load(parentId = '') {
    const version = epoch.current, controller = new AbortController()
    loaders.current.get(parentId)?.abort(); loaders.current.set(parentId, controller)
    setBusy(true); setError('')
    try {
      const result = await invokeExtension(view, origin, host.sessionId, 'tree', view.view.id, parentId ? [parentId] : [], actions, AbortSignal.any([host.signal, controller.signal]))
      const items = z.array(extensionTreeItemSchema).max(500).parse(result)
      if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('树形视图返回了重复节点')
      if (!host.signal.aborted && version === epoch.current) setNodes(current => {
        if (Object.values(current).reduce((sum, values) => sum + values.length, 0) - (current[parentId]?.length ?? 0) + items.length > 5000) { setError('树形视图超过 5000 个已加载节点'); return current }
        return { ...current, [parentId]: items }
      })
    } catch (reason) { if (!host.signal.aborted && !controller.signal.aborted && version === epoch.current) setError(String(reason)) }
    finally { if (loaders.current.get(parentId) === controller) loaders.current.delete(parentId); if (!host.signal.aborted && version === epoch.current) setBusy(loaders.current.size > 0) }
  }
  useEffect(() => {
    epoch.current++; setNodes({}); setExpanded(new Set()); void load()
    return () => { epoch.current++; loaders.current.forEach(controller => controller.abort()); loaders.current.clear() }
  }, [view, host, revision])
  const run = async (command: string, args = [] as import('@eden/api').JsonValue[]) => {
    try { setError(''); await invokeExtension(view, origin, host.sessionId, 'command', command, args, actions, host.signal) }
    catch (reason) { if (!host.signal.aborted) setError(String(reason)) }
  }
  const render = (parent: string, ancestors = new Set<string>(), depth = 0): import('react').ReactNode => depth > 24 ? null : <ul role={depth ? 'group' : 'tree'}>
    {(Object.hasOwn(nodes, parent) ? nodes[parent] : []).map(item => <li key={item.id} role="treeitem" aria-expanded={item.hasChildren ? expanded.has(item.id) : undefined}>
      <div className="flex items-center gap-2 px-3 py-1 hover:bg-surface-hover" onContextMenu={event => { event.preventDefault(); setMenu({ item, x: event.clientX, y: event.clientY }) }}>
        <button type="button" aria-label={item.hasChildren ? `${expanded.has(item.id) ? '折叠' : '展开'} ${item.label}` : item.label} onClick={() => {
          if (item.hasChildren) {
            setExpanded(current => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next })
            if (!Object.hasOwn(nodes, item.id)) void load(item.id)
          } else if (item.command) void run(item.command, item.arguments)
        }}>{item.hasChildren ? expanded.has(item.id) ? '▾ ' : '▸ ' : ''}{item.label}</button>
        {item.description && <span className="text-text-muted">{item.description}</span>}
      </div>
      {expanded.has(item.id) && !ancestors.has(item.id) && <div className="pl-4">{render(item.id, new Set([...ancestors, item.id]), depth + 1)}</div>}
    </li>)}
  </ul>
  const document = view.module.document
  return <section aria-label={view.view.title} className="h-full overflow-auto">
    <header className="flex items-center justify-between border-b border-border p-2"><span>{view.view.title}</span><button disabled={busy} onClick={() => setRevision(value => value + 1)}>刷新</button></header>
    {busy && <p role="status" className="p-2 text-text-muted">正在读取…</p>}{error && <p role="alert" className="p-2 text-danger">{error}</p>}{render('')}
    {menu && document.apiVersion === 2 && <div role="menu" aria-label="节点操作" className="fixed z-50 rounded border border-border bg-surface p-2 shadow-lg" style={{ left: menu.x, top: menu.y }}>
      {document.contributes.menus.filter(item => item.location === 'view/item/context' && (!item.view || item.view === view.view.id)
        && matchesContribution(item.when, context) && document.contributes.commands.some(command => command.id === item.command && matchesContribution(command.when, context))).map(item => <button role="menuitem" className="block p-2" key={item.command} onClick={() => { setMenu(undefined); void run(item.command, [menu.item.id]) }}>{document.contributes.commands.find(command => command.id === item.command)?.title}</button>)}
      <button role="menuitem" onClick={() => setMenu(undefined)}>关闭</button>
    </div>}
  </section>
}
