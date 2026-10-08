const assert = require('node:assert/strict')
const { test } = require('node:test')
const { setTimeout: pause } = require('node:timers/promises')
const { createDesktopReminderService } = require('../src/reminders/reminder-service.cjs')

function windowFactory(created) {
  return options => {
    let destroyed = false
    const window = { isDestroyed: () => destroyed, destroy() { destroyed = true; options.onClosed() } }
    created.push({ options, window })
    return window
  }
}
async function until(condition) {
  for (let i = 0; i < 100; i++) { if (condition()) return; await pause(5) }
  assert.fail('Reminder service did not reach the expected state')
}
const reminder = { id: 'fixture-reminder', title: 'Fixture', message: 'No customer content', state: 'pending' }

test('account change drops stale delivery and acknowledgements, preserving the local window', async t => {
  let token = 'account-a', releaseOld, firstRead = true
  const created = [], acknowledgements = []
  const service = createDesktopReminderService({
    coreToken: () => token, createWindow: windowFactory(created), retryIntervalMs: 15,
    rpcRequest: async (origin, method, params) => {
      if (method !== 'desktop.reminder.list') { acknowledgements.push({ origin, method, token }); return {} }
      if (origin === 'mon' && firstRead) { firstRead = false; return await new Promise(resolve => { releaseOld = resolve }) }
      return [{ ...reminder, id: origin + '-' + token }]
    },
  })
  t.after(() => service.close())
  service.start()
  await until(() => Boolean(releaseOld))
  token = 'account-b'; service.authenticationChanged()
  releaseOld([{ ...reminder, id: 'stale-account-a' }])
  await until(() => created.length === 2)
  assert.equal(created.some(value => value.options.reminder.id === 'stale-account-a'), false)
  const mon = created.find(value => value.options.origin === 'mon')
  const local = created.find(value => value.options.origin === 'local')
  token = null; service.authenticationChanged()
  assert.equal(mon.window.isDestroyed(), true)
  assert.equal(local.window.isDestroyed(), false)
  await assert.rejects(mon.options.acknowledge(), /account changed/)
  await local.options.acknowledge()
  assert.deepEqual(acknowledgements.map(value => value.origin), ['local'])
})

test('a displayed reminder survives change notifications until its close is confirmed', async t => {
  const created = []
  let state = 'pending', reads = 0
  const listeners = new Map()
  const rpcRequest = Object.assign(async (origin, method) => {
      if (origin === 'local') return []
      if (method === 'desktop.reminder.displayed') { state = 'displayed'; return { ...reminder, state } }
      if (method === 'desktop.reminder.close') { state = 'closed'; return { ...reminder, state } }
      reads++; return state === 'closed' ? [] : [{ ...reminder, state }]
    }, { subscribe: (origin, listener) => { listeners.set(origin, listener); return () => listeners.delete(origin) } })
  const service = createDesktopReminderService({
    coreToken: () => 'fixture-account', createWindow: windowFactory(created), retryIntervalMs: 10, rpcRequest,
  })
  t.after(() => service.close())
  service.start()
  await until(() => created.length === 1)
  await created[0].options.displayed()
  listeners.get('mon')({ type: 'changed' }); await until(() => reads === 2)
  listeners.get('mon')({ type: 'changed' }); await until(() => reads === 3)
  assert.equal(created.length, 1)
  assert.equal(created[0].window.isDestroyed(), false)
  await created[0].options.acknowledge()
  await until(() => created[0].window.isDestroyed())
})

test('healthy reminder connections stay idle, pushes refresh immediately and shutdown unsubscribes', async t => {
  const listeners = new Map(), reads = { mon: 0, local: 0 }, created = []
  let queued = false, closed = false
  const rpcRequest = Object.assign(async origin => { reads[origin]++; return queued && origin === 'local' ? [reminder] : [] }, {
    subscribe: (origin, listener) => { listeners.set(origin, listener); return () => listeners.delete(origin) },
    close: () => { closed = true },
  })
  const service = createDesktopReminderService({ coreToken: () => 'fixture', rpcRequest, createWindow: windowFactory(created), retryIntervalMs: 10 })
  t.after(() => service.close()); service.start()
  await until(() => reads.mon === 1 && reads.local === 1)
  await pause(60)
  assert.deepEqual(reads, { mon: 1, local: 1 }, 'Healthy connections do not poll at the retry interval')
  queued = true; listeners.get('local')({ type: 'changed' })
  await until(() => created.length === 1)
  assert.deepEqual(reads, { mon: 1, local: 2 })
  service.close()
  assert.equal(listeners.size, 0); assert.equal(closed, true)
  await pause(30)
  assert.deepEqual(reads, { mon: 1, local: 2 })
})

test('disconnect retries refresh the durable queue while the other world stays idle', async t => {
  const listeners = new Map(), reads = { mon: 0, local: 0 }, created = []
  let queued = false
  const rpcRequest = Object.assign(async origin => { reads[origin]++; return queued && origin === 'local' ? [reminder] : [] }, {
    subscribe: (origin, listener) => { listeners.set(origin, listener); return () => listeners.delete(origin) },
  })
  const service = createDesktopReminderService({ coreToken: () => 'fixture', rpcRequest, createWindow: windowFactory(created), retryIntervalMs: 10 })
  t.after(() => service.close()); service.start()
  await until(() => reads.mon === 1 && reads.local === 1)
  queued = true; listeners.get('local')({ type: 'disconnected' })
  await until(() => created.length === 1)
  assert.deepEqual(reads, { mon: 1, local: 2 })
})

test('delivery failures are logged once even when no reminder window could open', async t => {
  const errors = [], created = []
  let attempts = 0
  const service = createDesktopReminderService({
    coreToken: () => 'fixture-account', createWindow: windowFactory(created), retryIntervalMs: 10,
    logger: { warn: message => errors.push(message) },
    rpcRequest: async origin => { if (origin === 'local') return []; attempts++; throw new Error('fixture delivery unavailable') },
  })
  t.after(() => service.close())
  service.start()
  await until(() => attempts >= 3)
  assert.equal(created.length, 0)
  assert.deepEqual(errors, ['Reminder service mon: fixture delivery unavailable'])
})

test('confirming a window immediately advances the queue even when its native close runs first', async t => {
  const created = [], queue = [{ ...reminder, id: 'first' }, { ...reminder, id: 'second' }]
  const rpcRequest = async (origin, method) => {
    if (origin === 'mon') return []
    if (method === 'desktop.reminder.close') return queue.shift()
    return queue.slice()
  }
  const service = createDesktopReminderService({ rpcRequest, createWindow: windowFactory(created), retryIntervalMs: 5000 })
  t.after(() => service.close()); service.start()
  await until(() => created.length === 1)
  await created[0].options.acknowledge(); created[0].window.destroy()
  await until(() => created.length === 2)
  assert.equal(created[1].options.reminder.id, 'second')
})
