import { useEffect, useMemo, useRef, useState } from 'react'
import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import { usePluginUi } from '../plugin-ui/PluginUiProvider'
import { extensionViewActions } from '../plugin-ui/extension-view-actions'
import { invokeExtension } from '../../lib/extensions/extension-invocation'
import { matchesContribution } from '../../lib/extensions/contribution-context'
import { extensionShortcutOwner, publishExtensionShortcuts, runExtensionShortcut, type ExtensionShortcut } from '../../lib/extensions/extension-keybindings'
import type { WorkbenchCommand } from './WorkbenchDialogs'
import type { ExtensionUiActions } from '../../lib/extensions/extension-bridge'
import type { ExtensionController } from '../../lib/extensions/extension-controller'
export interface ExtensionMenuEntry { location: string; view?: string; command: WorkbenchCommand; title: string; order: number }

export function useExtensionWorkbench({ sessionId, running, activeView, onOpenView, notice, active=true }: {
  sessionId: string; running: boolean; activeView?: string; onOpenView(view: PluginUiLoadedView, sessionId?: string): void; notice(message: string): void; active?:boolean
}) {
  const { extensions, views, origin } = usePluginUi()
  const [statuses, setStatuses] = useState<Record<string, string>>({}), [operations, setOperations] = useState<{ id: string; title: string; controller: AbortController; execution: ExtensionController }[]>([])
  const latest = useRef({ views, onOpenView, notice }); latest.current = { views, onOpenView, notice }
  const actions = useMemo<ExtensionUiActions>(() => ({
    message: message => latest.current.notice(message), progress: message => latest.current.notice(message),
    openView: (key, boundSessionId) => { const view = latest.current.views.find(view => view.key === key); if (!view) throw new Error('扩展视图不可用'); latest.current.onOpenView(view, boundSessionId) },
    status: (id, text) => setStatuses(current => ({ ...current, [id]: text })),
    refreshTree: () => {}, postMessage: () => {},
  }), [])
  const context = { sessionAvailable: Boolean(sessionId), sessionRunning: running, activeView }
  const commands: WorkbenchCommand[] = [], menus: ExtensionMenuEntry[] = [], shortcuts: ExtensionShortcut[] = []
  const statusItems: { key: string; text: string; command?: WorkbenchCommand; alignment: string; priority: number }[] = []
  for (const extension of extensions) {
    if (extension.module.document.apiVersion !== 2) continue
    const { contributes } = extension.module.document, prefix = `${extension.module.pluginId}/${extension.module.componentId}/`
    const view: PluginUiLoadedView = { key: prefix + '$extension', module: extension.module,
      view: { id: '$extension', title: extension.module.pluginName, slot: 'page', toolNames: [] }, signal: extension.signal,
      extension: extension.controller, Component: () => null }
    const declared = new Map<string, WorkbenchCommand>()
    for (const command of contributes.commands) {
      if (!matchesContribution(command.when, context)) continue
      const keys = contributes.keybindings.filter(key => key.command === command.id && matchesContribution(key.when, context)).map(item => item.key)
      const shortcut = keys[0]
      const item: WorkbenchCommand = { id: 'extension:' + prefix + command.id, title: `${extension.module.pluginName}：${command.title}`, shortcut,
        run: async (args = []) => {
          latest.current.notice('')
          const id = crypto.randomUUID(), controller = new AbortController()
          setOperations(current => [...current, { id, title: command.title, controller, execution: extension.controller }])
          try { await invokeExtension(view, origin, sessionId || undefined, 'command', command.id, args, extensionViewActions(view, actions, sessionId || undefined), controller.signal) }
          finally { setOperations(current => current.filter(operation => operation.id !== id)) }
        } }
      commands.push(item); declared.set(command.id, item)
      for (const key of keys) shortcuts.push({ owner: extensionShortcutOwner(extension.module.pluginId, extension.module.componentId, sessionId), key, run: async () => {
        try { await item.run() } catch (reason) { latest.current.notice(String(reason)) }
      } })
    }
    for (const menu of contributes.menus) {
      const command = declared.get(menu.command)
      if (command && matchesContribution(menu.when, context)) menus.push({ location: menu.location, ...(menu.view ? { view: prefix + menu.view } : {}), command,
        title: contributes.commands.find(item => item.id === menu.command)!.title, order: menu.order })
    }
    for (const item of contributes.statusBar) if (matchesContribution(item.when, context)) statusItems.push({ key: prefix + item.id,
      text: statuses[prefix + extension.module.revision + '/' + item.id] ?? item.text, command: item.command ? declared.get(item.command) : undefined, alignment: item.alignment, priority: item.priority })
  }
  const current = useRef({ commands, operations, active }); current.current = { commands, operations, active }
  useEffect(() => { publishExtensionShortcuts(active?shortcuts:[]); return () => publishExtensionShortcuts([]) }, [shortcuts,active])
  useEffect(() => () => { current.current.operations.forEach(item => item.controller.abort()) }, [origin])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!current.current.active || event.defaultPrevented || document.querySelector('dialog[open]') || event.isComposing) return
      const editing = Boolean((event.target as HTMLElement)?.closest('input,textarea,[contenteditable="true"]'))
      if (runExtensionShortcut({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, editing })) event.preventDefault()
    }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown)
  }, [])
  return { actions, commands, menus: menus.sort((a, b) => a.order - b.order), statusItems: statusItems.sort((a, b) => b.priority - a.priority), operations }
}
