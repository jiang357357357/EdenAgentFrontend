import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

const originalWebSocket = globalThis.WebSocket
const sockets = []
class Socket extends EventTarget {
  static OPEN = 1
  readyState = 1
  requests = []
  closes = []
  constructor() { super(); sockets.push(this); queueMicrotask(() => this.dispatchEvent(new Event('open'))) }
  send(raw) {
    const request = JSON.parse(raw)
    this.requests.push(request)
    if (request.method !== 'initialize') return
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
      jsonrpc: '2.0', id: request.id, result: { protocolVersion: 2, serverName: 'fixture', serverVersion: '2',
        agentCoreVersion: 'pi', runtimeOrigin: 'local', capabilities: [] }, error: null,
    }) })))
  }
  serverClose(code, reason, wasClean) {
    this.readyState = 3
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason, wasClean }))
  }
  close(code = 1000, reason = '') { this.closes.push({ code, reason }); this.serverClose(code, reason, true) }
}
globalThis.WebSocket = Socket
const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
const { EdenAgentRpcClient } = await vite.ssrLoadModule('/src/lib/rpc-client.ts')
const { connectionCloseMessage } = await vite.ssrLoadModule('/src/lib/connection-diagnostics.ts')
beforeEach(() => { sockets.length = 0 })
after(async () => { globalThis.WebSocket = originalWebSocket; await vite.close() })

test('remote close evidence reaches listeners once and rejects pending RPC without retrying it', async () => {
  const client = new EdenAgentRpcClient(), observed = []
  client.onClose(info => observed.push(info))
  await client.connect('ws://fixture/rpc', 'fixture', 'test', 'local')
  const pending = assert.rejects(client.request('ping', {}), /pending execution outcomes are unconfirmed/)
  const info = { code: 1013, reason: 'Event consumer did not drain the connection', wasClean: true }
  sockets[0].serverClose(info.code, info.reason, info.wasClean)
  await pending
  client.close()
  sockets[0].serverClose(1006, '', false)
  assert.deepEqual(observed, [info])
  assert.deepEqual(sockets[0].requests.map(request => request.method), ['initialize', 'ping'])
})

test('local synchronization causes survive the later close event and no-argument callbacks remain compatible', async () => {
  const client = new EdenAgentRpcClient(), observed = []
  let legacyCalls = 0
  client.onClose(() => { legacyCalls++ })
  client.onClose(info => observed.push(info))
  const remove = client.onClose(() => assert.fail('removed close listener ran'))
  remove()
  await client.connect('ws://fixture/rpc', 'fixture', 'test', 'local')
  client.close({ code: 1000, reason: 'event sequence gap' })
  assert.deepEqual(observed, [{ code: 1000, reason: 'event sequence gap', wasClean: false }])
  assert.equal(legacyCalls, 1)
  assert.deepEqual(sockets[0].closes, [{ code: 1000, reason: 'event sequence gap' }])
})

test('invalid RPC envelopes expose their cause and use a browser-permitted local close code', async () => {
  const client = new EdenAgentRpcClient(), observed = []
  client.onClose(info => observed.push(info))
  await client.connect('ws://fixture/rpc', 'fixture', 'test', 'local')
  sockets[0].dispatchEvent(new MessageEvent('message', { data: 'invalid JSON' }))
  assert.deepEqual(observed, [{ code: 1000, reason: 'invalid RPC envelope', wasClean: false }])
  assert.deepEqual(sockets[0].closes, [{ code: 1000, reason: 'invalid RPC envelope' }])
})

test('late close events from a replaced socket cannot overwrite the new connection diagnostics', async () => {
  const client = new EdenAgentRpcClient(), observed = []
  client.onClose(info => observed.push(info))
  await client.connect('ws://fixture/rpc', 'fixture', 'test', 'local')
  const previous = sockets[0]
  client.close()
  await client.connect('ws://fixture/rpc', 'fixture', 'test', 'local')
  previous.serverClose(1011, 'late old error', false)
  assert.equal(observed.length, 1)
  sockets[1].serverClose(1006, '', false)
  assert.deepEqual(observed[1], { code: 1006, reason: '', wasClean: false })
})

test('connection messages distinguish authentication, capacity, network, service, and local synchronization causes', () => {
  const cases = [
    [1008, 'Core account authentication failed', 'Core 账号验证失败，连接已中断'],
    [1008, 'Core account authentication expired', 'Core 账号验证失败，连接已中断'],
    [1008, 'Request queue limit exceeded', '连接请求过于频繁，服务已关闭连接'],
    [1008, 'other policy refusal', '服务拒绝了当前连接'],
    [1013, 'Event consumer did not drain the connection', '客户端接收速度过慢，连接已中断'],
    [1013, 'Event stream lagged', '会话同步暂时繁忙，连接已中断'],
    [1006, '', '与服务的网络连接意外中断'],
    [1011, 'Durable event delivery failed', '服务处理异常，连接已中断'],
    [1000, 'event sequence gap', '会话状态需要重新同步'],
    [1000, 'invalid session event', '收到无效的服务消息，连接已中断'],
    [1000, 'invalid server warning', '收到无效的服务消息，连接已中断'],
    [1000, 'invalid RPC envelope', '收到无效的服务消息，连接已中断'],
    [1000, 'event stream lagged', '会话同步暂时繁忙，连接已中断'],
  ]
  for (const [code, reason, expected] of cases) {
    const result = connectionCloseMessage({ code, reason, wasClean: false })
    assert.equal(result, expected)
    assert.doesNotMatch(result, /模型|工具执行失败/)
  }
})
