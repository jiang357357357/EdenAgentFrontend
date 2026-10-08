const { createRealmRpcConnection } = require('./realm-rpc-connection.cjs')

/** Main-process RPC for desktop-owned UI. Tokens never enter the reminder renderer. */
function createRealmRpc({ capability, coreToken = () => null, WebSocketClass = globalThis.WebSocket, timeoutMs = 10000 }) {
  const connections = new Map(), listeners = new Map()
  let closed = false
  function invalidate(origin) {
    const current = connections.get(origin)
    connections.delete(origin)
    current?.connection.close(new Error('Desktop RPC account or server changed'))
  }
  function connectionFor(origin) {
    if (closed) throw new Error('Desktop RPC service closed')
    if (origin !== 'mon' && origin !== 'local') throw new Error('Invalid desktop RPC world')
    const accountToken = origin === 'mon' ? coreToken() : null
    if (origin === 'mon' && !accountToken) { invalidate(origin); throw new Error('请先登录 Core 账号') }
    const access = capability(origin), url = new URL('/rpc', access.baseUrl)
    if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:') throw new Error('Desktop RPC requires the loopback server')
    url.protocol = 'ws:'
    const current = connections.get(origin)
    if (current && current.url === url.href && current.token === access.token && current.accountToken === accountToken && current.workspaceId === access.workspaceId) return current.connection
    invalidate(origin)
    const entry = { url: url.href, token: access.token, accountToken, workspaceId: access.workspaceId }
    connections.set(origin, entry)
    try {
      entry.connection = createRealmRpcConnection({ url, token: access.token, origin, accountToken, workspaceId: access.workspaceId, WebSocketClass, timeoutMs,
        notify(event) {
          if (connections.get(origin) !== entry) return
          if (event.type === 'disconnected') connections.delete(origin)
          for (const listener of listeners.get(origin) || []) listener(event)
        },
      })
      return entry.connection
    } catch (error) { connections.delete(origin); throw error }
  }
  async function request(origin, method, params = {}, options = {}) {
    return connectionFor(origin).request(method, params, options)
  }
  request.subscribe = (origin, listener) => {
    if (!listeners.has(origin)) listeners.set(origin, new Set())
    const subscribers = listeners.get(origin)
    subscribers.add(listener)
    return () => { subscribers.delete(listener); if (!subscribers.size) listeners.delete(origin) }
  }
  request.invalidate = invalidate
  request.close = () => { closed = true; listeners.clear(); for (const origin of connections.keys()) invalidate(origin) }
  return request
}
module.exports = { createRealmRpc }
