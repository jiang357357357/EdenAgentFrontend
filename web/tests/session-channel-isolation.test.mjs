import assert from 'node:assert/strict'
import { test, after, afterEach } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'

const previousWindow = globalThis.window, previousSocket = globalThis.WebSocket
const sockets = [], events = new EventTarget()
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
class Socket extends EventTarget {
  static OPEN = 1
  readyState = 1; requests = []
  constructor() { super(); sockets.push(this); queueMicrotask(() => this.dispatchEvent(new Event('open'))) }
  send(raw) {
    const request = JSON.parse(raw); this.requests.push(request)
    const result = request.method === 'initialize'
      ? { protocolVersion: 2, serverName: 'fixture', serverVersion: '2', agentCoreVersion: 'fixture', runtimeOrigin: request.params.runtimeOrigin, capabilities: [] }
      : request.method === 'ping' ? { pong: true } : { items: [], hasMore: false, nextCursor: null }
    queueMicrotask(() => this.receive({ id: request.id, result }))
  }
  receive(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ jsonrpc: '2.0', ...value }) })) }
  close(code = 1000, reason = '') {
    if (this.readyState === 3) return
    this.readyState = 3; this.dispatchEvent(Object.assign(new Event('close'), { code, reason, wasClean: true }))
  }
}
globalThis.WebSocket = Socket
globalThis.window = { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
  localStorage: { getItem: key => key === 'agent.runtime_origin' ? 'local' : null },
  edenAgentDesktop: { getAgentCapability: async () => ({ token: 'synthetic-test-capability' }) } }
const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
const transport = await vite.ssrLoadModule('/src/lib/rpc-transport.ts')
const disposers = []
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); events.dispatchEvent(new Event('edenagent:account-changed')); sockets.length = 0 })
after(async () => { await vite.close(); globalThis.window = previousWindow; globalThis.WebSocket = previousSocket })
async function until(predicate) { for (let i = 0; i < 200; i++) { if (predicate()) return; await delay(10) }; assert.fail('Session channel recovery timed out') }
const channel = id => sockets.findLast(socket => socket.requests[0]?.params.sessionId === id)
function event(socket, id, seq) { socket.receive({ method: 'session.event', params: { id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
  sessionId: id, turnId: null, seq: String(seq), eventType: 'turn.started', payload: {}, createdAt: 1 } }) }

test('one session gap reconnects only that socket and replays its cursor while siblings and control keep working', async () => {
  const received = [], globalStates = [], states = []
  disposers.push(await transport.subscribeRpcEvents(value => received.push(value), connected => globalStates.push(connected)))
  disposers.push(transport.subscribeSessionChannelStatus(value => states.push(value)))
  await until(() => globalStates.includes(true))
  await Promise.all([a, b].map(sessionId => transport.rpcRequest('event.list', { sessionId, afterSeq: '0', limit: 1 })))
  assert.equal(sockets.length, 3)
  const first = channel(a), other = channel(b), control = sockets[0]
  assert.equal(control.requests[0].params.eventMode, 'discovery')
  event(first, a, 1); event(other, b, 1); event(first, a, 3)
  assert.equal(first.readyState, 3); assert.equal(other.readyState, 1); assert.equal(control.readyState, 1)
  event(other, b, 2)
  assert.deepEqual(await transport.rpcRequest('ping', {}), { pong: true })
  await until(() => channel(a) !== first && states.filter(value => value.sessionId === a && value.connected).length === 2)
  const restored = channel(a)
  assert.equal(restored.requests[0].params.afterSeq, '1')
  event(restored, a, 2); event(restored, a, 2); event(restored, a, 3)
  assert.deepEqual(received.map(value => [value.sessionId, value.seq]), [[a, '1'], [b, '1'], [b, '2'], [a, '2'], [a, '3']])
  assert.deepEqual(globalStates, [true])
  assert.deepEqual(states.filter(value => value.sessionId === b).map(value => value.connected), [true])
})

test('discovery opens a background channel from its handoff cursor and repeated notices reuse the socket', async () => {
  const received = []
  disposers.push(await transport.subscribeRpcEvents(value => received.push(value)))
  await until(() => sockets[0]?.requests.length)
  await transport.rpcRequest('ping', {})
  const control = sockets[0]
  control.receive({ method: 'session.discovered', params: { sessionId: b, afterSeq: '40' } })
  await until(() => channel(b)?.requests.length)
  assert.equal(channel(b).requests[0].params.afterSeq, '40')
  await delay(0)
  event(channel(b), b, 41)
  control.receive({ method: 'session.discovered', params: { sessionId: b, afterSeq: '41' } })
  await delay(0)
  assert.equal(sockets.length, 2)
  assert.equal(received[0].seq, '41')
})

test('account change closes every session socket and ignores queued old events', async () => {
  const received = []
  disposers.push(await transport.subscribeRpcEvents(value => received.push(value)))
  await transport.rpcRequest('ping', {})
  await Promise.all([a, b].map(sessionId => transport.rpcRequest('event.list', { sessionId, afterSeq: '0', limit: 1 })))
  const old = [...sockets]
  events.dispatchEvent(new Event('edenagent:account-changed'))
  event(old[1], a, 1); event(old[2], b, 1)
  assert.ok(old.every(socket => socket.readyState === 3))
  assert.deepEqual(received, [])
})
