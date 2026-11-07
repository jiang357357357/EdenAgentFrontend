import type { PluginUiHost, PluginUiCallOptions, PluginUiOperation, PluginUiConnectorEvent } from '@eden/plugin-sdk/ui'
import type { PluginUiLoadedView } from './plugin-ui-runtime'
import type { JsonValue, PluginUiCall } from '@eden/api'
import { callPluginUiOperation } from './plugin-ui-operation'
import type { RuntimeOrigin } from './runtime-origin'
import { getRuntimeOriginRevision } from './runtime-origin'
import { observeSessionEvents, openPluginSessionChannel, subscribeSessionChannelStatus } from './rpc-transport'

export function createPluginUiHost(view: PluginUiLoadedView, origin: RuntimeOrigin, sessionId?: string,
  lifecycle?: { setDirty(dirty: boolean): void; registerSave(save: () => Promise<void>): () => void;
    onOperations?(operations: PluginUiOperation[]): void }) {
  const controller = new AbortController(), pending = new Map<string, { controller: AbortController; operation: PluginUiOperation }>()
  let open = true
  const publish = () => { if (open) lifecycle?.onOperations?.([...pending.values()].map(item => item.operation)) }
  const cleanups = new Set<() => void>()
  const cancel = () => {
    controller.abort()
    for (const cleanup of cleanups) cleanup()
    cleanups.clear()
  }
  view.signal.addEventListener('abort', cancel, { once: true })
  if (view.signal.aborted) cancel()
  async function call(action: PluginUiCall['action'], input: Record<string, JsonValue>, options?: PluginUiCallOptions) {
    controller.signal.throwIfAborted()
    const requestId = crypto.randomUUID()
    const local = new AbortController(), operation: PluginUiOperation = { id: requestId, state: 'starting' }
    pending.set(requestId, { controller: local, operation }); publish()
    const signal = AbortSignal.any([controller.signal, local.signal, ...options?.signal ? [options.signal] : []])
    try {
      const result = await callPluginUiOperation(origin, {
        pluginId: view.module.pluginId, componentId: view.module.componentId, revision: view.module.revision,
        viewId: view.view.id, ...(sessionId ? { sessionId } : {}),
      }, requestId, action, input, signal, state => { operation.state = state; publish() })
      controller.signal.throwIfAborted()
      return result
    } finally { pending.delete(requestId); publish() }
  }
  function onConnectorEvent(listener: (event: PluginUiConnectorEvent) => void) {
    controller.signal.throwIfAborted()
    if (!sessionId) throw new Error('请先选择会话')
    if (!view.module.document.capabilities.tools.includes('read_connector_events')) throw new Error('界面未声明 read_connector_events')
    const revision = getRuntimeOriginRevision(), seen = new Set<string>()
    const release = openPluginSessionChannel(origin, sessionId)
    const send = (event: PluginUiConnectorEvent) => {
      if (controller.signal.aborted || revision !== getRuntimeOriginRevision()) return
      try { listener(event) } catch (error) { console.error('Plugin connector event listener failed', error) }
    }
    const stopEvents = observeSessionEvents(event => {
      if (event.sessionId === sessionId && event.eventType === 'connector.sharing') { send({ type: 'resync' }); return }
      if (event.sessionId !== sessionId || event.eventType !== 'connector.event' || !event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return
      const { connectorId, eventId, eventType } = event.payload
      if (typeof connectorId !== 'string' || typeof eventId !== 'string' || typeof eventType !== 'string' || seen.has(eventId)) return
      seen.add(eventId)
      if (seen.size > 256) seen.delete(seen.values().next().value!)
      send({ type: 'event', connectorId, eventId, eventType })
    })
    const stopStatus = subscribeSessionChannelStatus(status => { if (status.sessionId === sessionId && status.connected) send({ type: 'resync' }) })
    let active = true
    const cleanup = () => { if (!active) return; active = false; cleanups.delete(cleanup); stopEvents(); stopStatus(); release() }
    cleanups.add(cleanup)
    return cleanup
  }
  const host: PluginUiHost = Object.freeze({ sessionId, signal: controller.signal,
    readSession: () => call('session.read', {}),
    sendMessage: (text: string) => call('session.send', { text }),
    callTool: (name: string, input: Record<string, JsonValue>, options?: PluginUiCallOptions) => call('tool.call', { name, input }, options),
    onConnectorEvent,
    setDirty: (dirty: boolean) => { controller.signal.throwIfAborted(); lifecycle?.setDirty(dirty) },
    registerSave: (save: () => Promise<void>) => {
      controller.signal.throwIfAborted()
      const cleanup = lifecycle?.registerSave(save) ?? (() => {})
      cleanups.add(cleanup)
      return () => { cleanups.delete(cleanup); cleanup() }
    },
  })
  return { host, call, cancel: (id: string) => pending.get(id)?.controller.abort(new DOMException('操作已取消，请刷新核对结果。', 'AbortError')),
    close: () => { open = false; view.signal.removeEventListener('abort', cancel); cancel() } }
}
