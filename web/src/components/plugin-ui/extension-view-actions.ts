import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import type { ExtensionUiActions } from '../../lib/extensions/extension-bridge'

export function extensionViewActions(view: PluginUiLoadedView, actions: ExtensionUiActions, sessionId?: string): ExtensionUiActions {
  const prefix = `${view.module.pluginId}/${view.module.componentId}/`
  return { ...actions, openView: id => {
    const target = view.module.document.views.find(item => item.id === id)
    if (!target) throw new Error('视图未声明')
    if ('renderer' in target && target.renderer === 'editor') throw new Error('请从工作区文件入口打开自定义编辑器')
    actions.openView(prefix + id, sessionId)
  }, status: (id, text) => {
    if (view.module.document.apiVersion !== 2 || !view.module.document.contributes.statusBar.some(item => item.id === id)) throw new Error('状态栏项目未声明')
    actions.status(prefix + view.module.revision + '/' + id, text)
  }, refreshTree: id => {
    if (!view.module.document.views.some(item => item.id === id)) throw new Error('视图未声明')
    view.extension!.notifyView('refresh', id, undefined, { sessionId })
  }, postMessage: message => {
    const targets = view.view.id === '$extension' ? view.module.document.views : [view.view]
    for (const target of targets) view.extension!.notifyView('message', target.id, message,
      { sessionId, ...(view.view.id === '$extension' || !view.instanceId ? {} : { instanceId: view.instanceId }) })
  } }
}
