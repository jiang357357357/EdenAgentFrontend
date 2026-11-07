import type { PluginUiModule, PluginUiReport } from '@eden/api'
import type { RuntimeOrigin } from './runtime-origin'
import { rpcRequestForOrigin } from './rpc-transport'

const clientId = crypto.randomUUID()
export function reportPluginUi(origin: RuntimeOrigin, module: PluginUiModule,
  status: PluginUiReport['status'], viewId?: string, error?: string, executionState?: PluginUiReport['executionState']) {
  return rpcRequestForOrigin(origin, 'plugin.ui.report', { pluginId: module.pluginId,
    componentId: module.componentId, revision: module.revision, clientId, status,
    ...(viewId ? { viewId } : {}), ...(error ? { error: error.slice(0, 2000) } : {}), ...(executionState ? { executionState } : {}) }).catch(() => {})
}

export function reportPluginUiDiagnostic(origin: RuntimeOrigin, module: PluginUiModule, viewId: string, sessionId: string | undefined,
  entries: { kind: 'error' | 'unhandledrejection' | 'console' | 'network' | 'csp'; message: string }[]) {
  if (!sessionId || !entries.length) return Promise.resolve()
  return rpcRequestForOrigin(origin, 'plugin.ui.diagnostic', { pluginId: module.pluginId, componentId: module.componentId,
    revision: module.revision, viewId, sessionId, clientId, entries: entries.slice(0, 20).map(item => ({ ...item, message: item.message.slice(0, 2000) })) })
    .then(() => {}).catch(() => {})
}
