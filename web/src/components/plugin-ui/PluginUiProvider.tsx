import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { pluginUiRpcMethods } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { PluginUiRuntime } from '../../lib/plugin-ui-runtime'
import type { PluginUiSnapshot } from '../../lib/plugin-ui-runtime'
import type { RuntimeOrigin } from '../../lib/runtime-origin'
import { reportPluginUi } from '../../lib/plugin-ui-reports'

interface PluginUiState extends PluginUiSnapshot { origin: RuntimeOrigin; sessionId?: string }
const Context = createContext<PluginUiState>({ views: [], errors: [], extensions: [], origin: 'mon', catalogReady:false })
export function PluginUiProvider({ children, origin, sessionId, enabled }: {
  children: ReactNode; origin: RuntimeOrigin; sessionId?: string; enabled: boolean
}) {
  const runtime = useMemo(() => new PluginUiRuntime(async module => pluginUiRpcMethods['plugin.ui.read'].result.parse(
    await rpcRequestForOrigin(origin, 'plugin.ui.read', { pluginId: module.pluginId, componentId: module.componentId, revision: module.revision })),
    (module, status, error, executionState) => { void reportPluginUi(origin, module, status, undefined, error, executionState) }), [origin])
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  useEffect(() => {
    if (!enabled) return
    runtime.open()
    let stopped = false, running = false, lastReport = 0
    async function refresh() {
      if (stopped || running) return
      running = true
      try {
        const catalog = pluginUiRpcMethods['plugin.ui.list'].result.parse(await rpcRequestForOrigin(origin, 'plugin.ui.list', {}))
        if (!stopped) await runtime.sync(catalog.modules, catalog.errors.map(item => `${item.pluginId}：${item.error}`))
        if (!stopped && Date.now() - lastReport > 30_000) {
          lastReport = Date.now()
          for (const module of catalog.modules) {
            if (runtime.getSnapshot().views.some(view => view.module.pluginId === module.pluginId && view.module.componentId === module.componentId)
              || runtime.getSnapshot().extensions.some(item => item.module.pluginId === module.pluginId && item.module.componentId === module.componentId)) {
              const diagnostic = runtime.getSnapshot().extensions.find(item => item.module.pluginId === module.pluginId && item.module.componentId === module.componentId)?.controller.status()
              void reportPluginUi(origin, module, diagnostic?.state === 'failed' ? 'failed' : 'loaded', undefined, diagnostic?.error, diagnostic?.state)
            }
          }
        }
      } catch (error) { if (!stopped) await runtime.sync([], [`扩展同步失败：${String(error)}`],false) }
      finally { running = false }
    }
    void refresh()
    const retry = () => { runtime.retryFailed(); void refresh() }
    const timer = setInterval(() => { void refresh() }, 2000)
    window.addEventListener('edenagent:plugins-changed', refresh)
    window.addEventListener('edenagent:plugins-retry', retry)
    return () => {
      stopped = true; clearInterval(timer)
      window.removeEventListener('edenagent:plugins-changed', refresh)
      window.removeEventListener('edenagent:plugins-retry', retry)
      runtime.close()
    }
  }, [enabled, origin, runtime])
  return <Context.Provider value={{ ...snapshot, origin, sessionId }}>{children}</Context.Provider>
}
export function usePluginUi() { return useContext(Context) }
export function PluginUiSession({ sessionId, children }: { sessionId?: string; children: ReactNode }) {
  const current = usePluginUi()
  return <Context.Provider value={{ ...current, sessionId }}>{children}</Context.Provider>
}
