const assert = require('node:assert/strict')
const { test } = require('node:test')
const { once } = require('node:events')
const { setTimeout: pause } = require('node:timers/promises')
const { WebSocketServer, WebSocket } = require('ws')
const { createRealmRpc } = require('../src/processes/realm-rpc.cjs')

async function server(t, onRequest) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(wss, 'listening')
  t.after(() => new Promise(resolve => { for (const socket of wss.clients) socket.terminate(); wss.close(resolve) }))
  wss.on('connection', socket => socket.on('message', data => {
    const request = JSON.parse(data)
    onRequest(request, socket)
  }))
  return { wss, capability: () => ({ baseUrl: `http://127.0.0.1:${wss.address().port}`, token: 'fixture-capability' }) }
}

test('Mon desktop requests authenticate initialize with the current Core login on every connection', async t => {
  let token = 'fixture-account-a'
  const initializations = []
  const fixture = await server(t, (request, socket) => {
    if (request.method === 'initialize') {
      initializations.push(request.params)
      if (request.params.coreToken !== token) socket.send(JSON.stringify({ id: request.id, error: { message: 'Login required' } }))
      else socket.send(JSON.stringify({ id: request.id, result: { protocolVersion: 2, runtimeOrigin: 'mon' } }))
    } else socket.send(JSON.stringify({ id: request.id, result: [{ state: 'pending' }] }))
  })
  const rpc = createRealmRpc({ capability: fixture.capability, coreToken: () => token, WebSocketClass: WebSocket })
  t.after(() => rpc.close())
  assert.deepEqual(await rpc('mon', 'desktop.reminder.list'), [{ state: 'pending' }])
  token = 'fixture-account-b'
  await rpc('mon', 'desktop.reminder.list')
  assert.deepEqual(initializations.map(value => value.coreToken), ['fixture-account-a', 'fixture-account-b'])
})

test('local desktop requests never read or transmit Core credentials', async t => {
  const fixture = await server(t, (request, socket) => {
    if (request.method === 'initialize') {
      assert.equal(Object.hasOwn(request.params, 'coreToken'), false)
      socket.send(JSON.stringify({ id: request.id, result: { protocolVersion: 2, runtimeOrigin: 'local' } }))
    } else socket.send(JSON.stringify({ id: request.id, result: [] }))
  })
  const rpc = createRealmRpc({ capability: fixture.capability, coreToken: () => { throw new Error('Must not read Mon login') }, WebSocketClass: WebSocket })
  t.after(() => rpc.close())
  assert.deepEqual(await rpc('local', 'desktop.reminder.list'), [])
})

test('logged-out Mon delivery does not open a socket', async t => {
  const fixture = await server(t, () => assert.fail('Logged-out client connected'))
  const rpc = createRealmRpc({ capability: fixture.capability, WebSocketClass: WebSocket })
  t.after(() => rpc.close())
  await assert.rejects(rpc('mon', 'desktop.reminder.list'), /Core/)
  assert.equal(fixture.wss.clients.size, 0)
})

test('repeated and concurrent requests reuse one authenticated connection per world', async t => {
  let initializations = 0
  const fixture = await server(t, (request, socket) => {
    if (request.method === 'initialize') {
      initializations++
      socket.send(JSON.stringify({ id: request.id, result: { protocolVersion: 2, runtimeOrigin: 'mon' } }))
    } else socket.send(JSON.stringify({ id: request.id, result: request.params.value }))
  })
  const rpc = createRealmRpc({ capability: fixture.capability, coreToken: () => 'fixture-account', WebSocketClass: WebSocket })
  t.after(() => rpc.close?.())
  assert.deepEqual(await Promise.all([rpc('mon', 'read', { value: 'first' }), rpc('mon', 'read', { value: 'second' })]), ['first', 'second'])
  assert.equal(await rpc('mon', 'read', { value: 'third' }), 'third')
  assert.equal(initializations, 1)
  assert.equal(fixture.wss.clients.size, 1)
})

test('a cancelled request does not close the shared connection or cancel another request', async t => {
  const controller = new AbortController()
  const fixture = await server(t, (request, socket) => {
    if (request.method === 'initialize') socket.send(JSON.stringify({ id: request.id, result: { protocolVersion: 2, runtimeOrigin: 'mon' } }))
    else if (request.method === 'cancel') controller.abort()
    else socket.send(JSON.stringify({ id: request.id, result: 'still-connected' }))
  })
  const rpc = createRealmRpc({ capability: fixture.capability, coreToken: () => 'fixture-account', WebSocketClass: WebSocket })
  t.after(() => rpc.close())
  const cancelled = assert.rejects(rpc('mon', 'cancel', {}, { signal: controller.signal }), /cancelled/)
  assert.equal(await rpc('mon', 'read'), 'still-connected')
  await cancelled
  assert.equal(fixture.wss.clients.size, 1)
})

test('out-of-order responses use distinct IDs and remain on one connection', async t => {
  const queued = []
  const fixture = await server(t, (request, socket) => {
    if (request.method === 'initialize') {
      assert.equal(request.params.eventMode, 'reminders')
      socket.send(JSON.stringify({ id: request.id, result: { protocolVersion: 2, runtimeOrigin: 'local' } }))
    } else {
      queued.push(request)
      if (queued.length === 2) for (const value of queued.toReversed()) socket.send(JSON.stringify({ id: value.id, result: value.params.value }))
    }
  })
  const rpc = createRealmRpc({ capability: fixture.capability, WebSocketClass: WebSocket })
  t.after(() => rpc.close())
  assert.deepEqual(await Promise.all([rpc('local', 'read', { value: 1 }), rpc('local', 'read', { value: 2 })]), [1, 2])
  assert.notEqual(queued[0].id, queued[1].id)
})

test('a disconnected connection notifies once and reconnects on the next request', async t => {
  let initializations = 0
  const fixture = await server(t, (request, socket) => {
    if (request.method === 'initialize') { initializations++; socket.send(JSON.stringify({ id: request.id, result: { protocolVersion: 2, runtimeOrigin: 'local' } })) }
    else socket.send(JSON.stringify({ id: request.id, result: [] }))
  })
  const rpc = createRealmRpc({ capability: fixture.capability, WebSocketClass: WebSocket }), notifications = []
  t.after(() => rpc.close())
  rpc.subscribe('local', event => notifications.push(event))
  await rpc('local', 'read')
  const socket = [...fixture.wss.clients][0]
  socket.send(JSON.stringify({ method: 'desktop.reminder.changed', params: { runtimeOrigin: 'local' } }))
  await pause(10)
  assert.deepEqual(notifications, [{ type: 'changed' }])
  socket.terminate()
  for (let i = 0; i < 100 && notifications.length < 2; i++) await pause(5)
  assert.deepEqual(notifications, [{ type: 'changed' }, { type: 'disconnected' }])
  await rpc('local', 'read')
  assert.equal(initializations, 2)
})

test('timeout closes the connection without replaying an unconfirmed mutation', async t => {
  let mutations = 0
  const fixture = await server(t, (request, socket) => {
    if (request.method === 'initialize') socket.send(JSON.stringify({ id: request.id, result: { protocolVersion: 2, runtimeOrigin: 'local' } }))
    else if (request.method === 'desktop.reminder.close') mutations++
    else socket.send(JSON.stringify({ id: request.id, result: [] }))
  })
  const rpc = createRealmRpc({ capability: fixture.capability, WebSocketClass: WebSocket, timeoutMs: 50 })
  t.after(() => rpc.close())
  await assert.rejects(rpc('local', 'desktop.reminder.close'), /timed out/)
  await rpc('local', 'read')
  assert.equal(mutations, 1)
})

test('Mon invalidation leaves the local connection open and ignores stale notifications', async t => {
  const initializations = []
  const fixture = await server(t, (request, socket) => {
    if (request.method === 'initialize') { initializations.push(request.params); socket.send(JSON.stringify({ id: request.id, result: { protocolVersion: 2, runtimeOrigin: request.params.runtimeOrigin } })) }
    else socket.send(JSON.stringify({ id: request.id, result: [] }))
  })
  let token = 'account-a'
  const rpc = createRealmRpc({ capability: fixture.capability, coreToken: () => token, WebSocketClass: WebSocket })
  t.after(() => rpc.close())
  const notifications = []
  rpc.subscribe('mon', event => notifications.push(event))
  await rpc('mon', 'read'); await rpc('local', 'read')
  const oldMon = [...fixture.wss.clients][0]
  rpc.invalidate('mon'); token = 'account-b'
  oldMon.send(JSON.stringify({ method: 'desktop.reminder.changed', params: { runtimeOrigin: 'mon' } }))
  await rpc('mon', 'read'); await rpc('local', 'read')
  assert.deepEqual(initializations.map(value => value.runtimeOrigin), ['mon', 'local', 'mon'])
  assert.equal(initializations[2].coreToken, 'account-b')
  assert.deepEqual(notifications, [])
  rpc.close()
  await assert.rejects(rpc('local', 'read'), /service closed/)
})

test('world mismatch fails initialization rather than issuing a reminder request', async t => {
  const fixture = await server(t, (request, socket) => {
    assert.equal(request.method, 'initialize')
    socket.send(JSON.stringify({ id: request.id, result: { protocolVersion: 2, runtimeOrigin: 'mon' } }))
  })
  const rpc = createRealmRpc({ capability: fixture.capability, WebSocketClass: WebSocket })
  t.after(() => rpc.close())
  await assert.rejects(rpc('local', 'read'), /world mismatch/)
})
