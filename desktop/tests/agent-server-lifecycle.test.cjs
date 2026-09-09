const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createAgentServerManager } = require('../src/processes/agent-server.cjs')

function fixture() {
  const children = []
  const manager = createAgentServerManager({
    app: { isPackaged: false, getPath: () => '/tmp/user' }, agentRoot: '/workspace', stopTimeoutMs: 15,
    processObject: { platform: 'linux', execPath: '/node', env: { OPENAI_API_KEY: 'secret', MON_CORE_TOKEN: 'secret' } },
    fileSystem: { existsSync: () => true, mkdirSync: () => {} },
    spawnProcess: (executable, args, options) => {
      const child = new EventEmitter()
      child.signals = []; child.kill = signal => { child.signals.push(signal); return true }
      children.push({ child, executable, args, options }); return child
    },
  })
  return { manager, children }
}

test('restart coalesces, waits for actual exit and keeps the other realm running', async () => {
  const { manager, children } = fixture()
  manager.start()
  assert.equal(children[0].options.env.OPENAI_API_KEY, undefined)
  assert.equal(children[1].options.env.MON_CORE_TOKEN, undefined)
  const first = manager.restart('local')
  assert.equal(manager.restart('local'), first)
  assert.equal(children.length, 2)
  assert.throws(() => manager.start('local'), /stopping/)
  children[1].child.emit('exit', 0)
  await first
  assert.equal(children.length, 3)
  assert.deepEqual(children[0].child.signals, [])
  assert.deepEqual(children[1].child.signals, ['SIGTERM'])
})

test('unconfirmed termination fails restart without spawning a competing server', async () => {
  const { manager, children } = fixture()
  manager.start('local')
  await assert.rejects(manager.restart('local'), /did not exit/)
  assert.equal(children.length, 1)
  assert.equal(manager.status('local').running, true)
  assert.deepEqual(children[0].child.signals, ['SIGTERM', 'SIGKILL'])
  children[0].child.emit('exit', null, 'SIGKILL')
  assert.equal(manager.status('local').running, false)
})

test('closing the desktop drains both children and prevents a pending restart', async () => {
  const { manager, children } = fixture()
  manager.start()
  const restart = manager.restart('local')
  const rejected = assert.rejects(restart, /stopping/)
  const close = manager.stop()
  children.forEach(({ child }) => child.emit('exit', 0))
  await close; await rejected
  assert.equal(children.length, 2)
  assert.equal(manager.status('local').running, false)
  assert.throws(() => manager.start(), /stopping/)
})

test('IPC shutdown is preferred so Windows also drains the Node server', async () => {
  const { manager, children } = fixture()
  manager.start('local')
  const child = children[0].child
  child.connected = true
  child.send = (message, callback) => { assert.equal(message, 'shutdown'); callback(null); queueMicrotask(() => child.emit('exit', 0)) }
  await manager.stop('local')
  assert.deepEqual(child.signals, [])
})
