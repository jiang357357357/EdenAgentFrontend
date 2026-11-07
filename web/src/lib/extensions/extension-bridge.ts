import { z } from 'zod'
import type { JsonValue, PluginUiCall } from '@eden/api'
import type { PluginUiHost } from '@eden/plugin-sdk/ui'
import type { ExtensionHostRequest } from './extension-protocol'

export interface ExtensionUiActions {
  message(message: string, severity: string): void
  progress(message: string): void
  openView(viewId: string, sessionId?: string): void
  status(id: string, text: string): void
  refreshTree(viewId: string): void
  postMessage(message: JsonValue): void
}
export function extensionBridge(host: PluginUiHost, call: (action: PluginUiCall['action'], input: Record<string, JsonValue>) => Promise<JsonValue>, ui: ExtensionUiActions) {
  return async (request: ExtensionHostRequest): Promise<JsonValue> => {
    host.signal.throwIfAborted()
    const input = request.input
    if (request.method === 'session.read') return host.readSession()
    if (request.method === 'session.send') return host.sendMessage(z.string().min(1).max(100_000).parse(input.text))
    if (request.method === 'tool.call') {
      const args = z.object({ name: z.string(), input: z.record(z.string(), z.unknown()) }).strict().parse(input)
      return host.callTool(args.name, args.input as Record<string, JsonValue>)
    }
    if (request.method === 'extension.state') return call('extension.state', input)
    if (request.method === 'message') ui.message(z.string().max(2000).parse(input.message), z.enum(['info', 'warning', 'error']).parse(input.severity))
    if (request.method === 'progress') ui.progress(z.string().max(2000).parse(input.message))
    if (request.method === 'openView') ui.openView(z.string().max(128).parse(input.viewId))
    if (request.method === 'status') ui.status(z.string().max(128).parse(input.id), z.string().max(128).parse(input.text))
    if (request.method === 'refreshTree') ui.refreshTree(z.string().max(128).parse(input.viewId))
    if (request.method === 'postMessage') ui.postMessage(input.message ?? null)
    return null
  }
}
