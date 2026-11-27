import { initializeResultSchema, isRpcRecoveryMethod, protocolVersion, websocketProtocol, tokenProtocolPrefix, streamCompactionCapability } from '@eden/api'
import type { InitializeResult } from '@eden/api'
import type { SchemaRpcMethodMap as RpcMethodMap, SchemaRpcNotificationMap as RpcNotificationMap, RuntimeOrigin } from '@eden/api'

type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
type Queued = { serialized: string; pending: Pending; initialize: boolean }
const maxInFlight = 16
const maxOrdinaryInFlight = maxInFlight - 2
const maxOutstanding = 256
export class AgentRpcError extends Error {
  constructor(message: string, readonly data?: unknown) { super(message); this.name = 'AgentRpcError' }
}
export interface RpcCloseInfo { code: number; reason: string; wasClean: boolean }
export interface RpcChannelOptions { sessionId?: string; eventMode?: RpcMethodMap['initialize']['params']['eventMode']; afterSeq?: string; workspaceId?: string }

/** A timeout ends local waiting only; callers must reconcile side effects before retrying. */
export class EdenAgentRpcClient {
  private socket: WebSocket | null = null
  private initialized = false
  private flushing = false
  private nextId = 1
  private readonly queued = new Map<number, Queued>()
  private readonly recovery = new Map<number, Queued>()
  // A locally timed-out send still occupies a slot until its reply arrives or its socket closes.
  private readonly sent = new Map<number, Pending | undefined>()
  private listeners = new Map<string, Set<(params: unknown) => void>>()
  private closeListeners = new Set<(info: RpcCloseInfo) => void>()
  constructor(private readonly requestTimeoutMs = 120000, private readonly connectTimeoutMs = 15000) {
    if (![requestTimeoutMs, connectTimeoutMs].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('RPC timeouts must be positive integers')
  }
  async connect(url: string, capabilityToken: string, clientVersion = 'dev', runtimeOrigin: RuntimeOrigin = 'mon', coreToken?: string, channel: RpcChannelOptions = {}): Promise<InitializeResult> {
    if (this.socket) throw new Error('Eden Agent RPC client is already connected')
    const socket = new WebSocket(url, [websocketProtocol, `${tokenProtocolPrefix}${capabilityToken}`])
    this.socket = socket
    socket.addEventListener('message', event => { if (this.socket === socket) this.handleMessage(socket, String(event.data)) })
    socket.addEventListener('close', event => this.disconnected(socket, {
      code: typeof event.code === 'number' ? event.code : 1006,
      reason: typeof event.reason === 'string' ? event.reason : '', wasClean: event.wasClean === true,
    }))
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
        protocolVersion, clientName: 'eden-agent-web', clientVersion, capabilities: ['session-events', streamCompactionCapability], runtimeOrigin, ...(coreToken ? { coreToken } : {}), ...channel,
      }))
      if (this.socket !== socket) throw new Error('RPC connection closed during initialization')
      if (channel.workspaceId && result.workspaceId !== channel.workspaceId)
        throw new Error('服务属于其他 EDEN 工作区，请使用对应的配置管理和客户端')
      this.initialized = true
      this.flush(socket)
      return result
    } catch (error) {
      this.disconnected(socket, { code: 1006, reason: 'RPC connection initialization failed', wasClean: false }); socket.close(); throw error
    }
  }
  request<K extends keyof RpcMethodMap>(method: K, params: RpcMethodMap[K]['params']): Promise<RpcMethodMap[K]['result']> {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Eden Agent RPC client is not connected'))
    const urgent = method === 'initialize' || isRpcRecoveryMethod(method)
    const limit = urgent ? maxOutstanding : maxOutstanding - 2
    if (this.sent.size + this.queued.size + this.recovery.size >= limit)
      return Promise.reject(new Error('Too many pending RPC requests; request was not sent'))
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
      const queue = urgent ? this.recovery : this.queued
      const timer = setTimeout(() => this.expire(socket, id, method, queue), this.requestTimeoutMs)
      queue.set(id, { serialized, initialize: method === 'initialize', pending: { resolve: resolve as (value: unknown) => void, reject, timer } })
      this.flush(socket)
    })
  }
  private expire(socket: WebSocket, id: number, method: string, queue: Map<number, Queued>): void {
    if (socket !== this.socket) return
    const waiting = queue.get(id)
    if (waiting) {
      queue.delete(id)
      waiting.pending.reject(new Error(`RPC ${method} timed out in the local queue; request was not sent`))
      return
    }
    const pending = this.sent.get(id)
    if (!pending) return
    this.sent.set(id, undefined)
    pending.reject(new Error(`RPC ${method} timed out; execution outcome is unconfirmed. Inspect task or operation history before retrying.`))
  }
  private flush(socket: WebSocket): void {
    if (this.flushing) return
    this.flushing = true
    try {
      while (this.socket === socket && socket.readyState === WebSocket.OPEN && this.sent.size < maxInFlight) {
        const queue = this.recovery.size ? this.recovery : this.queued
        if (queue === this.queued && this.sent.size >= maxOrdinaryInFlight) return
        const next = this.initialized ? queue.entries().next().value
          : this.sent.size === 0 ? [...this.recovery].find(([, entry]) => entry.initialize) : undefined
        if (!next) return
        const [id, { pending, serialized }] = next
        queue.delete(id)
        this.sent.set(id, pending)
        try { socket.send(serialized) }
        catch {
          clearTimeout(pending.timer)
          this.sent.delete(id)
          pending.reject(new Error('RPC send failed; inspect operation history before retrying'))
        }
      }
    } finally { this.flushing = false }
  }
  on<K extends keyof RpcNotificationMap>(method: K, listener: (params: RpcNotificationMap[K]) => void): () => void {
    const listeners = this.listeners.get(method) ?? new Set()
    const callback = listener as (params: unknown) => void
    listeners.add(callback); this.listeners.set(method, listeners)
    return () => { listeners.delete(callback); if (!listeners.size) this.listeners.delete(method) }
  }
  onClose(listener: (info: RpcCloseInfo) => void): () => void { this.closeListeners.add(listener); return () => { this.closeListeners.delete(listener) } }
  close(info: Pick<RpcCloseInfo, 'code' | 'reason'> = { code: 1000, reason: 'client closed' }): void {
    const socket = this.socket
    if (!socket) return
    this.disconnected(socket, { ...info, wasClean: false }); socket.close(info.code, info.reason)
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
    } catch { this.close({ code: 1000, reason: 'invalid RPC envelope' }); return }
    if (typeof message.id === 'number') {
      const pending = this.sent.get(message.id)
      if (!this.sent.delete(message.id)) return
      if (pending) this.complete(pending, message)
      this.flush(socket)
    } else if (!Object.hasOwn(message, 'id') && typeof message.method === 'string') {
      for (const listener of [...(this.listeners.get(message.method) ?? [])]) this.emit(() => listener(message.params))
    }
  }
  private complete(pending: Pending, message: Record<string, unknown>): void {
    clearTimeout(pending.timer)
    // Legacy Eden responses include an explicit null for the unused branch.
    const hasError = Object.hasOwn(message, 'error') && message.error !== null
    const hasResult = Object.hasOwn(message, 'result') && (!hasError || message.result !== null)
    if (hasResult === hasError) { pending.reject(new Error('Invalid RPC response; execution outcome is unconfirmed')); return }
    if (hasError) {
      const error = message.error
      pending.reject(new AgentRpcError(error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : 'Invalid RPC error response',
        error && typeof error === 'object' && 'data' in error ? error.data : undefined))
    } else pending.resolve(message.result)
  }
  private disconnected(socket: WebSocket, info: RpcCloseInfo): void {
    if (this.socket !== socket) return
    this.socket = null
    this.initialized = false
    for (const queue of [this.recovery, this.queued]) {
      for (const { pending } of queue.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error('RPC connection closed; queued request was not sent'))
      }
      queue.clear()
    }
    for (const pending of this.sent.values()) {
      if (!pending) continue
      clearTimeout(pending.timer)
      pending.reject(new Error('RPC connection closed; pending execution outcomes are unconfirmed'))
    }
    this.sent.clear()
    for (const listener of [...this.closeListeners]) this.emit(() => listener(info))
  }
}
