import type { JsonValue, PluginUiCall, PluginUiContext } from '@eden/api'
import type { PluginUiOperation } from '@eden/plugin-sdk/ui'
import { rpcRequestForOrigin } from './rpc-transport'
import type { RuntimeOrigin } from './runtime-origin'

/** Observe a single attempt; cancellation never resubmits a potentially completed write. */
export async function callPluginUiOperation(origin: RuntimeOrigin, context: PluginUiContext, requestId: string,
  action: PluginUiCall['action'], input: Record<string, JsonValue>, signal: AbortSignal,
  onState: (state: PluginUiOperation['state']) => void): Promise<JsonValue> {
  signal.throwIfAborted()
  let timer: ReturnType<typeof setTimeout> | undefined, finished = false
  let rejectAbort: (reason: unknown) => void = () => {}
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const cancel = () => {
    void rpcRequestForOrigin(origin, 'plugin.ui.cancel', { requestId }).catch(() => {})
    rejectAbort(signal.reason ?? new DOMException('操作已取消，请刷新核对已执行的结果。', 'AbortError'))
  }
  const poll = async () => {
    try {
      const status = await rpcRequestForOrigin(origin, 'plugin.ui.operation', { ...context, requestId })
      if (finished || signal.aborted) return
      if (status.state === 'waiting' || status.state === 'approval' || status.state === 'running') onState(status.state)
      timer = setTimeout(() => { void poll() }, 500)
    } catch {
      // Older hosts have no progress endpoint. The original call still owns its result.
    }
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const request = rpcRequestForOrigin(origin, 'plugin.ui.call', { ...context, requestId, action, input })
    timer = setTimeout(() => { void poll() }, 250)
    if (signal.aborted) cancel()
    return await Promise.race([request, aborted])
  } finally {
    finished = true; clearTimeout(timer); signal.removeEventListener('abort', cancel)
  }
}
