import { initializeResultSchema, protocolVersion, websocketProtocol, tokenProtocolPrefix } from '@eden/api'
import type { InitializeResult } from '@eden/api'
import type { SchemaRpcMethodMap as RpcMethodMap, SchemaRpcNotificationMap as RpcNotificationMap, RuntimeOrigin } from '@eden/api'

type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }

/** A timeout ends local waiting only; callers must reconcile side effects before retrying. */
export class EdenAgentRpcClient {
  private socket: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private listeners = new Map<string, Set<(params: unknown) => void>>()
  private closeListeners = new Set<() => void>()
  constructor(private readonly requestTimeoutMs = 120000, private readonly connectTimeoutMs = 15000) {
    if (![requestTimeoutMs, connectTimeoutMs].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('RPC timeouts must be positive integers')
  }
  async connect(url: string, capabilityToken: string, clientVersion = 'dev', runtimeOrigin: RuntimeOrigin = 'mon'): Promise<InitializeResult> {
    if (this.socket) throw new Error('Eden Agent RPC client is already connected')
    const socket = new WebSocket(url, [websocketProtocol, `${tokenProtocolPrefix}${capabilityToken}`])
    this.socket = socket
    socket.addEventListener('message', event => { if (this.socket === socket) this.handleMessage(socket, String(event.data)) })
    socket.addEventListener('close', () => this.disconnected(socket))
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); socket.removeEventListener('open', opened); socket.removeEventListener('error', failed); socket.removeEventListener('close', failed) }
        const opened = () => { cleanup(); resolve() }
        const failed = () => { cleanup(); reject(new Error('Eden Agent WebSocket connection failed')) }
        const timer = setTimeout(() => { cleanup(); reject(new Error('Eden Agent WebSocket connection timed out')) }, this.connectTimeoutMs)
        socket.addEventListener('open', opened, { once: true }); socket.addEventListener('error', failed, { once: true }); socket.addEventListener('close', failed, { once: true })
      })
      if (this.socket !== socket) throw new Error('RPC connection was replaced before initialization')
      const result = initializeResultSchema.parse(await this.request('initialize', {
        protocolVersion, clientName: 'eden-agent-web', clientVersion, capabilities: ['session-events'], runtimeOrigin,
      }))
      if (this.socket !== socket) throw new Error('RPC connection closed during initialization')
      return result
    } catch (error) {
      this.disconnected(socket); socket.close(); throw error
    }
  }
  request<K extends keyof RpcMethodMap>(method: K, params: RpcMethodMap[K]['params']): Promise<RpcMethodMap[K]['result']> {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Eden Agent RPC client is not connected'))
    if (this.pending.size >= 256) return Promise.reject(new Error('Too many pending RPC requests'))
    if (!Number.isSafeInteger(this.nextId)) return Promise.reject(new Error('RPC request IDs exhausted; reconnect'))
    const id = this.nextId++
    let serialized: string
    try {
      serialized = JSON.stringify({ jsonrpc: '2.0', id, method, params }, (_key, value) => {
        if (typeof value !== 'bigint') return value
        const number = Number(value)
        if (!Number.isSafeInteger(number)) throw new Error('RPC integer exceeds the exact JSON range')
        return number
      })
    } catch (error) { return Promise.reject(error) }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return
        reject(new Error(`RPC ${String(method)} timed out; execution outcome is unconfirmed. Inspect task or operation history before retrying.`))
      }, this.requestTimeoutMs)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      try { socket.send(serialized) }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new Error('RPC send failed; inspect operation history before retrying')) }
    })
  }
  on<K extends keyof RpcNotificationMap>(method: K, listener: (params: RpcNotificationMap[K]) => void): () => void {
    const listeners = this.listeners.get(method) ?? new Set()
    const callback = listener as (params: unknown) => void
    listeners.add(callback); this.listeners.set(method, listeners)
    return () => { listeners.delete(callback); if (!listeners.size) this.listeners.delete(method) }
  }
  onClose(listener: () => void): () => void { this.closeListeners.add(listener); return () => { this.closeListeners.delete(listener) } }
  close(): void {
    const socket = this.socket
    if (!socket) return
    this.disconnected(socket); socket.close(1000, 'client closed')
  }
  private emit(callback: () => void): void {
    try { callback() } catch (error) { globalThis.reportError(error) }
  }
  private handleMessage(socket: WebSocket, raw: string): void {
    let message: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid RPC envelope')
      message = parsed as Record<string, unknown>
      if (message.jsonrpc !== '2.0') throw new Error('Invalid RPC version')
    } catch { this.disconnected(socket); socket.close(1002, 'invalid RPC envelope'); return }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer); this.pending.delete(message.id)
      const hasResult = Object.hasOwn(message, 'result'), hasError = Object.hasOwn(message, 'error')
      if (hasResult === hasError) { pending.reject(new Error('Invalid RPC response; execution outcome is unconfirmed')); return }
      if (hasError) {
        const error = message.error
        pending.reject(new Error(error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : 'Invalid RPC error response'))
      } else pending.resolve(message.result)
    } else if (!Object.hasOwn(message, 'id') && typeof message.method === 'string') {
      for (const listener of [...(this.listeners.get(message.method) ?? [])]) this.emit(() => listener(message.params))
    }
  }
  private disconnected(socket: WebSocket): void {
    if (this.socket !== socket) return
    this.socket = null
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('RPC connection closed; pending execution outcomes are unconfirmed')) }
    this.pending.clear()
    for (const listener of [...this.closeListeners]) this.emit(listener)
  }
}
