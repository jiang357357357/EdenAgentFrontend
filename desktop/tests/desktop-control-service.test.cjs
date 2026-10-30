const assert = require('node:assert/strict')
const test = require('node:test')
const { setTimeout: pause } = require('node:timers/promises')
const { createDesktopControlService } = require('../src/desktop-control/control-service.cjs')
const { desktopStatus, controlView } = require('../src/desktop-control/control-status.cjs')

const idle = () => ({ available: true, busy: false, paused: false, stopped: false, observerAvailable: true, operations: [] })
async function until(check) {
  for (let i = 0; i < 150; i++) { if (check()) return; await pause(5) }
  assert.fail('Desktop control did not reach expected state')
}
function fixture(overrides = {}) {
  const created = [], calls = [], statuses = { mon: idle(), local: idle() }
  let token = 'synthetic-account', fail = false
  const rpcRequest = async (origin, method, params) => {
    calls.push({ origin, method, params })
    if (overrides.rpc) return overrides.rpc(origin, method, params)
    if (fail) throw new Error('synthetic connection failure')
    if (method === 'desktop.status') return structuredClone(statuses[origin])
    for (const status of Object.values(statuses)) {
      status.paused = params.action === 'pause'; status.stopped = params.action === 'stop'; status.busy = false; status.operations = []
    }
    return structuredClone(statuses[origin])
  }
  const service = createDesktopControlService({ intervalMs: 10, coreToken: () => token, rpcRequest,
    createWindow: options => {
      const view = { options, visible: false, shows: 0, hides: 0, state: null, window: { webContents: {} },
        update(value) { this.state = value }, show() { if (!this.visible) this.shows++; this.visible = true },
        hide() { if (this.visible) this.hides++; this.visible = false },
        close() { this.visible = false; options.onClosed() } }
      created.push(view); return view
    } })
  return { service, created, calls, statuses, setToken: value => { token = value; service.authenticationChanged() }, setFailure: value => { fail = value } }
}
function active(status, title = 'Temporary application') {
  status.busy = true; status.operations = [{ action: 'desktop_type', windowTitle: title, state: 'running' }]
}
async function poll(f) {
  const reads = f.calls.filter(c => c.method === 'desktop.status').length
  await until(() => f.calls.filter(c => c.method === 'desktop.status').length >= reads + 4)
}

test('activity stays hidden until the tray opens one window and controls use its world', async t => {
  const f = fixture(); t.after(() => f.service.close()); f.service.start()
  await until(() => f.calls.length >= 2); assert.equal(f.created.length, 0)
  active(f.statuses.local)
  await poll(f); assert.equal(f.created.length, 0, 'tool calls must not open the window')
  f.service.show()
  await until(() => f.created[0]?.state?.busy)
  const view = f.created[0]
  assert.equal(view.visible, true); assert.equal(view.state.operation.world, '尘世')
  await view.options.control('pause'); assert.equal(view.state.paused, true)
  assert.equal(f.calls.find(c => c.method === 'desktop.control').origin, 'local')
  await view.options.control('resume'); assert.equal(view.visible, true, 'resume keeps controls available for the next step')
  assert.equal(f.created.length, 1)
})

test('step gaps and alternating worlds do not hide and reopen a manually opened window', async t => {
  const f = fixture(); t.after(() => f.service.close()); f.service.start()
  await until(() => f.calls.length >= 2); assert.equal(f.created.length, 0)
  active(f.statuses.local)
  f.service.show()
  await until(() => f.created[0]?.state?.busy)
  const view = f.created[0]
  for (const origin of ['mon', 'local', 'mon']) {
    Object.assign(f.statuses.mon, idle()); Object.assign(f.statuses.local, idle())
    await until(() => !view.state.busy)
    await pause(25)
    assert.equal(view.visible, true, 'a gap between calls must not hide the window')
    active(f.statuses[origin], `${origin} next step`)
    await until(() => view.state.busy && view.state.operation?.origin === origin)
    assert.equal(view.visible, true)
  }
  assert.equal(f.created.length, 1); assert.equal(view.shows, 1); assert.equal(view.hides, 0)
  assert.equal(f.calls.filter(c => c.method === 'desktop.control').length, 0, 'visibility must not issue control mutations')
})

test('closed window stays hidden through new calls in either world and tray reopening reuses it', async t => {
  const f = fixture(); t.after(() => f.service.close()); active(f.statuses.local)
  f.service.start(); f.service.show(); await until(() => f.created[0]?.state?.busy)
  const view = f.created[0]
  Object.assign(f.statuses.local, idle())
  await until(() => !view.state.busy)
  await view.options.dismiss()
  await pause(45)
  assert.equal(view.visible, false); assert.equal(view.shows, 1); assert.equal(view.hides, 1)
  for (const origin of ['mon', 'local', 'mon']) {
    Object.assign(f.statuses.mon, idle()); Object.assign(f.statuses.local, idle())
    await poll(f)
    active(f.statuses[origin]); await poll(f)
    assert.equal(view.visible, false); assert.equal(view.shows, 1, 'a new tool call cannot undo dismissal')
  }
  assert.equal(f.calls.filter(c => c.method === 'desktop.control').length, 0)
  f.service.show(); await pause(25)
  assert.equal(f.created.length, 1); assert.equal(view.visible, true); assert.equal(view.shows, 2)
})

test('closing active control stops before hiding; tray reopening preserves the same window', async t => {
  const f = fixture(); t.after(() => f.service.close()); active(f.statuses.mon)
  f.service.start(); f.service.show(); await until(() => f.created[0]?.state?.busy)
  const view = f.created[0]; await view.options.dismiss()
  assert.equal(f.calls.filter(c => c.method === 'desktop.control').at(-1).params.action, 'stop')
  assert.equal(view.visible, false)
  await pause(40); assert.equal(view.visible, false, 'persistent stop must not reopen a dismissed window every poll')
  f.service.show(); assert.equal(view.visible, true); assert.equal(f.created.length, 1)
  assert.equal(f.service.owns(view.window.webContents), true)
})

test('failed stop stays visible and never retries the mutation through the other world', async t => {
  const f = fixture(); t.after(() => f.service.close()); active(f.statuses.local)
  f.service.start(); f.service.show(); await until(() => f.created[0]?.state?.busy)
  f.setFailure(true)
  await assert.rejects(f.created[0].options.dismiss(), /connection failure/)
  assert.equal(f.created[0].visible, true)
  assert.equal(f.calls.filter(c => c.method === 'desktop.control').length, 1)
  assert.match(f.created[0].state.error, /connection failure/)
})

test('account changes drop old task titles and ignore a delayed old-account status', async t => {
  let release
  const f = fixture({ rpc: async origin => origin === 'local' ? idle() : new Promise(resolve => { release = resolve }) })
  t.after(() => f.service.close()); f.service.start(); await until(() => Boolean(release))
  f.setToken(null)
  const stale = idle(); active(stale, 'Private old account')
  release(stale); await pause(35)
  assert.equal(f.created.length, 0)
  f.service.show(); assert.equal(f.created[0].state.operation, null)
  const existing = fixture(); t.after(() => existing.service.close())
  active(existing.statuses.mon, 'Previously displayed private title')
  existing.service.start(); existing.service.show(); await until(() => existing.created[0]?.state?.operation?.world === '伊甸园')
  existing.setToken(null)
  assert.equal(existing.created[0].state.operation, null, 'Hidden windows also discard old-account content')
  assert.equal(existing.created[0].visible, true, 'explicitly opened windows remain open with old-account content cleared')
})

test('status validation projects only displayed business facts', () => {
  const input = idle(); input.operations = [{ action: 'desktop_click', windowTitle: 'Fixture', state: 'running', sessionId: 'private-id', startedAt: 1 }]
  const result = desktopStatus(input)
  assert.equal(JSON.stringify(result).includes('private-id'), false)
  assert.throws(() => desktopStatus({ ...input, busy: 'yes' }), /格式无效/)
})

test('a slow Mon endpoint cannot delay the local control window or its status refreshes', async t => {
  let release, localReads = 0
  const local = idle(); active(local)
  const f = fixture({ rpc: async origin => {
    if (origin === 'mon') return new Promise(resolve => { release = resolve })
    localReads++; return structuredClone(local)
  } })
  t.after(() => { f.service.close(); release?.(idle()) })
  f.service.start()
  f.service.show()
  await until(() => f.created[0]?.state?.busy && localReads >= 3)
  assert.equal(f.created[0].state.operation.world, '尘世')
})

test('paused, stopped, disconnected and resumed status never creates a control window', async t => {
  const f = fixture(); t.after(() => f.service.close()); f.service.start()
  await poll(f)
  for (const flags of [{ paused: true }, { stopped: true }, { busy: true }, {}]) {
    Object.assign(f.statuses.local, idle(), flags)
    await poll(f); assert.equal(f.created.length, 0)
  }
  f.setFailure(true); await poll(f); assert.equal(f.created.length, 0)
  f.setFailure(false); active(f.statuses.mon); await poll(f)
  assert.equal(f.created.length, 0)
  f.setToken(null); await pause(25); assert.equal(f.created.length, 0)
  assert.equal(f.calls.filter(c => c.method === 'desktop.control').length, 0)
})

test('control reason follows the most recent global action instead of an older paused world', () => {
  const states = new Map([
    ['mon', { connected: true, status: { ...idle(), paused: true, control: { action: 'pause', source: 'physical_input', changedAt: 10, message: '检测到本机输入' } } }],
    ['local', { connected: true, status: { ...idle(), control: { action: 'resume', source: 'manual', changedAt: 20, message: '已恢复' } } }],
  ])
  const result = controlView(states)
  assert.equal(result.paused, false); assert.equal(result.control.action, 'resume')
  assert.equal(desktopStatus(states.get('mon').status).control.source, 'physical_input')
  assert.throws(() => desktopStatus({ ...idle(), control: { action: 'pause', source: 'physical_input', changedAt: 0.5 } }), /原因格式/)
})
