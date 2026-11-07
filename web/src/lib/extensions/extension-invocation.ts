import type { JsonValue } from '@eden/api'
import type { PluginUiLoadedView } from '../plugin-ui-runtime'
import { createPluginUiHost } from '../plugin-ui-host'
import type { RuntimeOrigin } from '../runtime-origin'
import { extensionBridge, type ExtensionUiActions } from './extension-bridge'

export async function invokeExtension(view: PluginUiLoadedView, origin: RuntimeOrigin, sessionId: string | undefined,
  kind: 'command' | 'tree' | 'message', target: string, args: JsonValue[], actions: ExtensionUiActions, signal?: AbortSignal) {
  if (!view.extension) throw new Error('扩展执行宿主不存在')
  const binding = createPluginUiHost(view, origin, sessionId)
  const close = () => binding.close()
  signal?.addEventListener('abort', close, { once: true })
  if (signal?.aborted) close()
  try {
    const bridge = extensionBridge(binding.host, binding.call, actions)
    return await view.extension.invoke(kind, target, args, { signal: binding.host.signal, ...(sessionId ? { sessionId } : {}),
      handle: async request => {
        const result = await bridge(request)
        if (request.method === 'extension.state' && request.input.namespace === 'configuration'
          && (request.input.value !== undefined || request.input.remove === true)) view.extension!.configurationChanged([String(request.input.key)])
        return result
      } })
  } finally { signal?.removeEventListener('abort', close); binding.close() }
}
