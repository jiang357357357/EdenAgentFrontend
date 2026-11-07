/// <reference lib="webworker" />
import { workerInvocationSchema, extensionResponseSchema } from './extension-protocol'
import type { ExtensionApi, ExtensionEntrypoint, ExtensionInvocation, Disposable } from '@eden/plugin-sdk/extension'
import { pluginUiDocumentSchema, type JsonValue } from '@eden/api'

const lifetime = new AbortController(), tasks = new Map<string, AbortController>()
const commands = new Map<string, Parameters<ExtensionApi['registerCommand']>[1]>()
const trees = new Map<string, Parameters<ExtensionApi['registerTreeDataProvider']>[1]>()
const messages = new Map<string, Parameters<ExtensionApi['registerWebviewMessageHandler']>[1]>()
const changes = new Set<(keys: string[]) => void>()
const pending = new Map<string, { resolve(value: JsonValue): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
let cleanup: Disposable | void, initialized = false

function request(invocation: string, method: string, input: Record<string, JsonValue>, signal: AbortSignal): Promise<JsonValue> {
  signal.throwIfAborted()
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); pending.delete(id); reject(new Error('操作已取消')) }
    const finish = (value: JsonValue) => { signal.removeEventListener('abort', abort); resolve(value) }
    const fail = (error: Error) => { signal.removeEventListener('abort', abort); reject(error) }
    const timer = setTimeout(() => { pending.delete(id); fail(new Error('扩展宿主请求超时')) }, 120_000)
    pending.set(id, { resolve: finish, reject: fail, timer })
    signal.addEventListener('abort', abort, { once: true })
    self.postMessage({ type: 'host', id, invocation, method, input })
  })
}
function context(id: string, signal: AbortSignal, sessionId?: string): ExtensionInvocation {
  const call = (method: string, input: Record<string, JsonValue> = {}) => request(id, method, input, signal)
  const storage = (namespace: string, scope: string) => ({
    get: async (key: string) => await call('extension.state', { namespace, scope, key }) as unknown as { value: JsonValue; revision: number },
    update: async (key: string, value: JsonValue, expectedRevision?: number) => await call('extension.state', { namespace, scope, key, value,
      ...(expectedRevision === undefined ? {} : { expectedRevision }) }) as unknown as { value: JsonValue; revision: number },
    remove: async (key: string, expectedRevision?: number) => await call('extension.state', { namespace, scope, key, remove: true,
      ...(expectedRevision === undefined ? {} : { expectedRevision }) }) as unknown as { value: JsonValue; revision: number },
  })
  return Object.freeze({ sessionId, signal, readSession: () => call('session.read'), sendMessage: (text: string) => call('session.send', { text }),
    callTool: (name: string, input: Record<string, JsonValue>) => call('tool.call', { name, input }),
    storage: (scope: 'global' | 'workspace') => storage('storage', scope), configuration: (scope: 'global' | 'workspace') => storage('configuration', scope),
    showMessage: async (message: string, severity = 'info') => { await call('message', { message, severity }) },
    showProgress: async (message: string) => { await call('progress', { message }) }, openView: async (viewId: string) => { await call('openView', { viewId }) },
    setStatusBarItem: async (id: string, text: string) => { await call('status', { id, text }) }, refreshTree: async (viewId: string) => { await call('refreshTree', { viewId }) },
    postMessage: async (message: JsonValue) => { await call('postMessage', { message }) },
  })
}
function register<T>(map: Map<string, T>, allowed: Set<string>, id: string, handler: T): Disposable {
  if (!allowed.has(id) || map.has(id)) throw new Error(`未声明或重复注册：${id}`)
  map.set(id, handler)
  return { dispose: () => { if (map.get(id) === handler) map.delete(id) } }
}
async function initialize(source: string, raw: unknown) {
  if (initialized) throw new Error('扩展已初始化')
  initialized = true
  const document = pluginUiDocumentSchema.parse(raw)
  if (document.apiVersion !== 2) throw new Error('扩展宿主仅接受 API 2')
  const allowed = new Set(document.contributes.commands.map(item => item.id)), views = new Set(document.views.map(view => view.id))
  const api: ExtensionApi = Object.freeze({ signal: lifetime.signal,
    registerCommand: (id, handler) => register(commands, allowed, id, handler),
    registerTreeDataProvider: (id, handler) => register(trees, new Set(document.views.filter(view => view.renderer === 'tree').map(view => view.id)), id, handler),
    registerWebviewMessageHandler: (id, handler) => register(messages, views, id, handler),
    onDidChangeConfiguration: listener => { changes.add(listener); return { dispose: () => { changes.delete(listener) } } },
    log: (level, message) => { self.postMessage({ type: 'log', level, message: String(message).slice(0, 4000) }) },
  })
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  try { const entry = await import(/* @vite-ignore */ url) as ExtensionEntrypoint; cleanup = await entry.activate(api) }
  finally { URL.revokeObjectURL(url) }
  for (const id of allowed) if (!commands.has(id)) throw new Error(`缺少命令实现：${id}`)
  for (const view of document.views) if (view.renderer === 'tree' && !trees.has(view.id)) throw new Error(`缺少树形数据提供程序：${view.id}`)
  self.postMessage({ type: 'ready' })
}
async function invoke(raw: unknown) {
  const input = workerInvocationSchema.parse(raw), controller = new AbortController()
  tasks.set(input.id, controller)
  try {
    const ctx = context(input.id, controller.signal, input.sessionId)
    self.postMessage({ type: 'started', id: input.id })
    let result: unknown
    if (input.kind === 'command') { const run = commands.get(input.target); if (!run) throw new Error('命令未注册'); result = await run(ctx, ...input.args) }
    if (input.kind === 'tree') { const run = trees.get(input.target); if (!run) throw new Error('树形视图未注册'); result = await run(ctx, typeof input.args[0] === 'string' ? input.args[0] : undefined) }
    if (input.kind === 'message') { const run = messages.get(input.target); if (!run) throw new Error('视图消息处理器未注册'); result = await run(ctx, input.args[0] ?? null) }
    self.postMessage({ type: 'result', id: input.id, result: result ?? null })
  } catch (error) { self.postMessage({ type: 'result', id: input.id, error: String(error).slice(0, 4000) }) }
  finally { tasks.delete(input.id) }
}
self.onmessage = event => {
  const input = event.data
  if (input?.type === 'initialize') void initialize(input.source, input.document).catch(error => self.postMessage({ type: 'failed', error: String(error) }))
  else if (input?.type === 'invoke') void invoke(input)
  else if (input?.type === 'cancel') tasks.get(input.id)?.abort()
  else if (input?.type === 'configuration') changes.forEach(listener => listener(input.keys))
  else if (input?.type === 'dispose') {
    try { lifetime.abort(); tasks.forEach(task => task.abort()); if (cleanup) cleanup.dispose() }
    finally { self.close() }
  }
  else {
    const parsed = extensionResponseSchema.safeParse(input)
    if (!parsed.success) return
    const result = pending.get(parsed.data.id)
    if (!result) return
    pending.delete(parsed.data.id); clearTimeout(result.timer)
    if (parsed.data.error) result.reject(new Error(parsed.data.error)); else result.resolve(parsed.data.result ?? null)
  }
}
