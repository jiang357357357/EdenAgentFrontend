import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
const { EdenAgentRpcClient } = await vite.ssrLoadModule('/src/lib/rpc-client.ts')
const original = globalThis.WebSocket
let socket
class Socket extends EventTarget {
  static OPEN = 1
  readyState = 1
  requests = []
  inFlight = new Set()
  peak = 0

  constructor() {
    super()
    socket = this
    queueMicrotask(() => this.dispatchEvent(new Event('open')))
  }

  send(raw) {
    const request = JSON.parse(raw)
    if (request.method === 'initialize') {
      queueMicrotask(() => this.reply(request.id, { protocolVersion: 2, serverName: 'fixture', serverVersion: '2',
        agentCoreVersion: 'pi', runtimeOrigin: 'local', capabilities: [] }))
      return
    }
    this.requests.push(request)
    this.inFlight.add(request.id)
    this.peak = Math.max(this.peak, this.inFlight.size)
  }

  reply(id, result = { pong: true }) {
    this.inFlight.delete(id)
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ jsonrpc: '2.0', id, result }) }))
  }

  close() { this.readyState = 3; this.dispatchEvent(new Event('close')) }
}
globalThis.WebSocket = Socket
after(async () => { globalThis.WebSocket = original; await vite.close() })

function connect(client) { return client.connect('ws://127.0.0.1:1/rpc', 'x'.repeat(43), 'test', 'local') }

test('a hundred queued RPCs send once with reservation for cancellation and approval', async () => {
  const client = new EdenAgentRpcClient()
  try {
    await connect(client)
    const queue = Array.from({ length: 98 }, () => client.request('ping', {}))
    assert.equal(socket.requests.length, 14)
    queue.push(client.request('turn.cancel', {}), client.request('permission.resolve', {}))
    assert.deepEqual(socket.requests.slice(14).map(item => item.method), ['turn.cancel', 'permission.resolve'])
    while (socket.inFlight.size) socket.reply(socket.inFlight.values().next().value)
    await Promise.all(queue)
    assert.equal(socket.requests.length, 100)
    assert.equal(new Set(socket.requests.map(item => item.id)).size, 100)
    assert.equal(socket.peak, 16)
  } finally { client.close() }
})

test('a locally timed-out send keeps its slot until the server replies', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const client = new EdenAgentRpcClient(100)
  try {
    await connect(client)
    const sent = Promise.allSettled(Array.from({ length: 14 }, () => client.request('ping', {})))
    context.mock.timers.tick(80)
    const queued = assert.rejects(client.request('ping', {}), /request was not sent/)
    context.mock.timers.tick(20)
    assert.ok((await sent).every(item => item.status === 'rejected' && /unconfirmed/.test(item.reason.message)))
    assert.equal(socket.requests.length, 14)
    context.mock.timers.tick(80)
    await queued
    const next = client.request('ping', {})
    socket.reply(socket.requests[0].id)
    assert.equal(socket.requests.length, 15)
    socket.reply(socket.requests.at(-1).id)
    await next
  } finally { client.close() }
})

test('closing a connection discards its unsent requests and ignores replies from the old socket', async () => {
  const client = new EdenAgentRpcClient()
  try {
    await connect(client)
    const old = socket
    const sent = Promise.allSettled(Array.from({ length: 14 }, () => client.request('ping', {})))
    const unsent = assert.rejects(client.request('ping', {}), /queued request was not sent/)
    old.close()
    await unsent
    assert.ok((await sent).every(item => item.status === 'rejected' && /unconfirmed/.test(item.reason.message)))
    await connect(client)
    old.reply(old.requests[0].id)
    assert.equal(old.requests.length, 14)
    assert.deepEqual(socket.requests, [])
    const request = client.request('ping', {})
    socket.reply(socket.requests[0].id)
    await request
  } finally { client.close() }
})
