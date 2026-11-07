import { extensionHostRequestSchema, extensionResponseSchema, type ExtensionHostRequest } from './extension-protocol'
import { jsonValue, type JsonValue, type PluginUiModule } from '@eden/api'

export interface InvocationBinding {
  sessionId?: string; signal: AbortSignal
  handle(request: ExtensionHostRequest): Promise<JsonValue>
}
interface Pending {
  binding: InvocationBinding; resolve(value: JsonValue): void; reject(error: Error): void
  timer: ReturnType<typeof setTimeout>; removeAbort(): void
  started?: boolean
}
export interface ExtensionDiagnostic { state: 'inactive' | 'activating' | 'ready' | 'failed'; error?: string; logs: string[] }
export interface ExtensionViewEvent { type: 'refresh' | 'message' | 'configuration'; viewId: string; message?: JsonValue; scope?: { sessionId?: string; instanceId?: string } }

/** Worker isolation keeps extension logic off the workbench's rendering thread. It is not an OS sandbox. */
export class ExtensionController {
  private worker?: Worker
  private ready?: Promise<void>
  private failReady?: (error: Error) => void
  private pending = new Map<string, Pending>()
  private cancelled = new Map<string, ReturnType<typeof setTimeout>>()
  private activationTimer?: ReturnType<typeof setTimeout>
  private diagnostic: ExtensionDiagnostic = { state: 'inactive', logs: [] }
  private closed = false
  private readonly viewListeners = new Set<(event: ExtensionViewEvent) => void>()
  constructor(readonly module: PluginUiModule, private readonly source: string, private readonly changed: () => void) {}
  status() { return { ...this.diagnostic, activeOperations: this.pending.size, runningOperations: [...this.pending.values()].filter(item => item.started).length } }
  onView(listener: (event: ExtensionViewEvent) => void) {
    this.viewListeners.add(listener); return () => { this.viewListeners.delete(listener) }
  }
  notifyView(type: ExtensionViewEvent['type'], viewId: string, message?: JsonValue, scope?: ExtensionViewEvent['scope']) {
    for (const listener of this.viewListeners) listener({ type, viewId, ...(message === undefined ? {} : { message }), ...(scope ? { scope } : {}) })
  }
  activate() {
    if (this.closed) return Promise.reject(new Error('扩展已卸载'))
    if (this.diagnostic.state === 'failed') return Promise.reject(new Error(this.diagnostic.error || '扩展执行宿主不可用，请手动重启'))
    if (this.ready) return this.ready
    this.diagnostic = { ...this.diagnostic, state: 'activating' }; this.changed()
    this.ready = new Promise<void>((resolve, reject) => {
      this.failReady = reject
      this.activationTimer = setTimeout(() => this.fail(new Error('扩展激活超时')), 10_000)
      try {
        this.worker = new Worker(new URL('./extension-worker.ts', import.meta.url), { type: 'module', name: `eden:${this.module.pluginId}` })
        this.worker.onmessage = event => {
          if (this.closed) return
          const input = event.data
          if (input?.type === 'ready') { clearTimeout(this.activationTimer); this.diagnostic = { ...this.diagnostic, state: 'ready' }; this.changed(); resolve() }
          else if (input?.type === 'failed') this.fail(new Error(String(input.error).slice(0, 4000)))
          else if (input?.type === 'log') {
            this.diagnostic = { ...this.diagnostic, logs: [...this.diagnostic.logs.slice(-99), `${input.level}: ${String(input.message).slice(0, 4000)}`] }; this.changed()
          } else void this.receive(input)
        }
        this.worker.onerror = event => { event.preventDefault(); if (!this.closed) this.fail(new Error(event.message || '扩展进程异常')) }
        this.worker.postMessage({ type: 'initialize', source: this.source, document: this.module.document })
      } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))) }
    })
    return this.ready
  }
  async invoke(kind: 'command' | 'tree' | 'message', target: string, args: JsonValue[], binding: InvocationBinding) {
    binding.signal.throwIfAborted()
    await this.waitForActivation(binding.signal)
    binding.signal.throwIfAborted()
    const id = crypto.randomUUID()
    return new Promise<JsonValue>((resolve, reject) => {
      const abort = () => {
        this.finish(id, new Error('扩展操作已取消，请核对已发生的业务结果'))
        this.worker?.postMessage({ type: 'cancel', id })
        this.cancelled.set(id, setTimeout(() => { this.cancelled.delete(id); this.fail(new Error('扩展未响应取消，已终止执行宿主')) }, 2000))
      }
      binding.signal.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(() => this.fail(new Error('扩展操作超时，已终止执行宿主')), 120_000)
      this.pending.set(id, { binding, resolve, reject, timer, removeAbort: () => binding.signal.removeEventListener('abort', abort) })
      this.worker!.postMessage({ type: 'invoke', id, kind, target, args, sessionId: binding.sessionId })
      if (binding.signal.aborted) abort()
    })
  }
  private waitForActivation(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason) }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) { abort(); return }
      this.activate().then(() => { signal.removeEventListener('abort', abort); resolve() }, error => {
        signal.removeEventListener('abort', abort); reject(error)
      })
    })
  }
  configurationChanged(keys: string[]) {
    this.worker?.postMessage({ type: 'configuration', keys })
    for (const view of this.module.document.views) this.notifyView('configuration', view.id, keys)
  }
  async restart() {
    this.fail(new Error('扩展宿主已手动重启；未重放业务操作'))
    this.ready = undefined; this.failReady = undefined
    this.diagnostic = { state: 'inactive', logs: this.diagnostic.logs }; this.changed()
    await this.activate()
    for (const view of this.module.document.views) this.notifyView('refresh', view.id)
  }
  private async receive(raw: unknown) {
    if (raw && typeof raw === 'object' && 'type' in raw && raw.type === 'started' && 'id' in raw && typeof raw.id === 'string') {
      const pending = this.pending.get(raw.id)
      if (pending) { pending.started = true; this.changed() }
      return
    }
    const result = extensionResponseSchema.safeParse(raw)
    if (result.success) {
      clearTimeout(this.cancelled.get(result.data.id)); this.cancelled.delete(result.data.id)
      this.finish(result.data.id, result.data.error ? new Error(result.data.error) : undefined, result.data.result)
      return
    }
    const request = extensionHostRequestSchema.safeParse(raw)
    if (!request.success) { this.fail(new Error('扩展发送了无效消息')); return }
    const pending = this.pending.get(request.data.invocation)
    if (!pending || pending.binding.signal.aborted) {
      this.worker?.postMessage({ type: 'result', id: request.data.id, error: '调用已结束或取消' }); return
    }
    try {
      const value = jsonValue.parse(await pending.binding.handle(request.data))
      if (this.pending.has(request.data.invocation)) this.worker?.postMessage({ type: 'result', id: request.data.id, result: value })
    } catch (error) { this.worker?.postMessage({ type: 'result', id: request.data.id, error: String(error).slice(0, 4000) }) }
  }
  private finish(id: string, error?: Error, result: JsonValue = null) {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id); clearTimeout(pending.timer); pending.removeAbort()
    if (error) pending.reject(error); else pending.resolve(result)
    this.changed()
  }
  private fail(error: Error) {
    this.worker?.terminate(); this.worker = undefined; clearTimeout(this.activationTimer)
    this.cancelled.forEach(clearTimeout); this.cancelled.clear()
    this.diagnostic = { ...this.diagnostic, state: 'failed', error: error.message }; this.changed()
    this.failReady?.(error)
    for (const id of this.pending.keys()) this.finish(id, error)
  }
  dispose() {
    if (this.closed) return
    this.closed = true
    const worker = this.worker
    this.worker = undefined
    try { worker?.postMessage({ type: 'dispose' }) } catch { worker?.terminate() }
    this.fail(new Error('扩展已卸载'))
    // Give synchronous disposal a bounded opportunity to release extension resources.
    if (worker) setTimeout(() => worker.terminate(), 100)
  }
}
