import { useContext } from 'react'
import type { PluginUiHost } from '@eden/plugin-sdk/ui'
import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import { ExtensionContributionContext, useExtensionWorkbenchActions } from './ExtensionWorkbenchContext'
import { matchesContribution } from '../../lib/extensions/contribution-context'
import { invokeExtension } from '../../lib/extensions/extension-invocation'
import { extensionViewActions } from './extension-view-actions'
import { usePluginUi } from './PluginUiProvider'

export function ExtensionViewToolbar({ view, host }: { view: PluginUiLoadedView; host: PluginUiHost }) {
  const context = useContext(ExtensionContributionContext), actions = useExtensionWorkbenchActions(), { origin } = usePluginUi()
  const document = view.module.document
  if (document.apiVersion !== 2) return null
  const commands = document.contributes.commands.filter(command => matchesContribution(command.when, context))
  const menus = document.contributes.menus.filter(menu => menu.location === 'view/title' && (!menu.view || menu.view === view.view.id)
    && matchesContribution(menu.when, context) && commands.some(command => command.id === menu.command)).sort((a, b) => a.order - b.order)
  if (!menus.length) return null
  return <nav aria-label={`${view.view.title}操作`} className="flex gap-2 border-b border-border p-2">{menus.map(menu => <button key={menu.command} className="rounded px-2 py-1 hover:bg-surface-hover" onClick={() => {
    void invokeExtension(view, origin, host.sessionId, 'command', menu.command, [], extensionViewActions(view, actions, host.sessionId), host.signal).catch(reason => actions.message(String(reason), 'error'))
  }}>{commands.find(command => command.id === menu.command)!.title}</button>)}</nav>
}
