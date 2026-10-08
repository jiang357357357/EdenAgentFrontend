/** One authenticated connection. Failed mutations are never replayed. */
function createRealmRpcConnection({ url, token, origin, accountToken, workspaceId, WebSocketClass, timeoutMs, notify }) {
  const socket = new WebSocketClass(url, ['eden-agent-rpc-v2', `eden-agent-token.${token}`])
  const pending = new Map()
  let closed = false, initialized = false, nextId = 1, resolveReady, rejectReady
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  void ready.catch(() => {})
  const initializationTimer = setTimeout(() => close(new Error('Desktop RPC initialization timed out')), timeoutMs)
  function close(error = new Error('Desktop RPC service closed')) {
    if (closed) return
    closed = true; clearTimeout(initializationTimer); rejectReady(error)
    for (const request of pending.values()) request.finish(error)
    pending.clear()
    socket.close()
    notify({ type: 'disconnected' })
  }
  function waitForReady(signal) {
    if (!signal) return ready
    if (signal.aborted) return Promise.reject(new Error('Desktop RPC cancelled'))
    return new Promise((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('Desktop RPC cancelled')) }
      signal.addEventListener('abort', abort, { once: true })
      ready.then(() => { signal.removeEventListener('abort', abort); resolve() }, error => {
        signal.removeEventListener('abort', abort); reject(error)
      })
    })
  }
  async function request(method, params, { signal } = {}) {
    await waitForReady(signal)
    if (closed) throw new Error('Desktop RPC connection closed')
    if (signal?.aborted) throw new Error('Desktop RPC cancelled')
    return new Promise((resolve, reject) => {
      const id = nextId++
      const finish = (error, value) => {
        if (!pending.delete(id)) return
        clearTimeout(timer); signal?.removeEventListener('abort', abort)
        if (error) reject(error); else resolve(value)
      }
      const abort = () => finish(new Error('Desktop RPC cancelled'))
      const timer = setTimeout(() => close(new Error('Desktop RPC timed out')), timeoutMs)
      pending.set(id, { finish })
      signal?.addEventListener('abort', abort, { once: true })
      try { socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params })) }
      catch (error) { close(error) }
    })
  }
  socket.addEventListener('open', () => {
    if (closed) return
    try {
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {
        protocolVersion: 2, runtimeOrigin: origin, clientName: 'eden-desktop-reminders', clientVersion: '2.0.0',
        capabilities: [], eventMode: 'reminders', ...(origin === 'mon' ? { coreToken: accountToken } : {}),
        ...(workspaceId ? { workspaceId } : {}),
      } }))
    } catch (error) { close(error) }
  })
  socket.addEventListener('message', event => {
    if (closed) return
    try {
      if (typeof event.data !== 'string' || event.data.length > 2 * 1024 * 1024) throw new Error('Invalid desktop RPC response')
      const message = JSON.parse(event.data)
      if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid desktop RPC response')
      if (message.id === 0 && !initialized) {
        if (message.error) throw new Error(String(message.error.message || 'Desktop RPC initialization failed'))
        if (message.result?.runtimeOrigin !== origin || message.result?.protocolVersion !== 2) throw new Error('Desktop RPC world mismatch')
        if (workspaceId && message.result?.workspaceId !== workspaceId) throw new Error('服务属于其他 EDEN 工作区，请使用对应的配置管理和客户端')
        initialized = true; clearTimeout(initializationTimer); resolveReady()
      } else if (initialized && message.method === 'desktop.reminder.changed' && message.id === undefined) {
        if (message.params?.runtimeOrigin !== origin) throw new Error('Desktop RPC world mismatch')
        notify({ type: 'changed' })
      } else if (initialized && pending.has(message.id)) {
        if (!Object.hasOwn(message, 'result') && !message.error) throw new Error('Invalid desktop RPC response')
        pending.get(message.id).finish(message.error ? new Error(String(message.error.message || 'Desktop RPC failed')) : null, message.result)
      }
    } catch (error) { close(error) }
  })
  socket.addEventListener('error', () => close(new Error('Desktop RPC connection failed')))
  socket.addEventListener('close', () => close(new Error('Desktop RPC connection closed')))
  return { request, close }
}
module.exports = { createRealmRpcConnection }
