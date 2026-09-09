/** Main-process RPC for desktop-owned UI. Tokens never enter the reminder renderer. */
function createRealmRpc({ capability, WebSocketClass = globalThis.WebSocket, timeoutMs = 10000 }) {
  return function request(origin, method, params = {}) {
    return new Promise((resolve, reject) => {
      let socket, timer, finished = false
      const finish = (error, value) => {
        if (finished) return
        finished = true; clearTimeout(timer)
        if (socket?.readyState === 1) socket.close()
        if (error) reject(error); else resolve(value)
      }
      try {
        const access = capability(origin)
        const url = new URL('/rpc', access.baseUrl)
        if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:') throw new Error('Desktop RPC requires the loopback server')
        url.protocol = 'ws:'
        socket = new WebSocketClass(url, ['eden-agent-rpc-v2', `eden-agent-token.${access.token}`])
        timer = setTimeout(() => { finish(new Error('Desktop RPC timed out')); socket.close() }, timeoutMs)
        socket.addEventListener('open', () => {
          if (finished) { socket.close(); return }
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
            protocolVersion: 2, runtimeOrigin: origin, clientName: 'eden-desktop-reminders', clientVersion: '2.0.0', capabilities: [],
          } }))
        })
        socket.addEventListener('message', event => {
          if (finished) return
          try {
            if (typeof event.data !== 'string' || event.data.length > 2 * 1024 * 1024) throw new Error('Invalid desktop RPC response')
            const message = JSON.parse(event.data)
            if (message.id !== 1 && message.id !== 2) return
            if (message.error) throw new Error(String(message.error.message || 'Desktop RPC failed'))
            if (message.id === 1) {
              if (message.result?.runtimeOrigin !== origin || message.result?.protocolVersion !== 2) throw new Error('Desktop RPC world mismatch')
              socket.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method, params }))
            } else finish(null, message.result)
          } catch (error) { finish(error) }
        })
        socket.addEventListener('error', () => finish(new Error('Desktop RPC connection failed')))
        socket.addEventListener('close', () => finish(new Error('Desktop RPC closed before response')))
      } catch (error) { finish(error) }
    })
  }
}
module.exports = { createRealmRpc }
