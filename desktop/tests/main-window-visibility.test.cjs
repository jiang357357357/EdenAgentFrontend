const assert = require('node:assert/strict')
const test = require('node:test')
const { EventEmitter } = require('node:events')
const { attachMainWindowVisibility } = require('../src/windows/main-window-visibility.cjs')

function fixture() {
  const window = new EventEmitter(), contents = new EventEmitter(), ipcMain = new EventEmitter()
  const state = { visible: false, minimized: false, destroyed: false }, messages = []
  window.webContents = contents
  window.isDestroyed = contents.isDestroyed = () => state.destroyed
  window.isVisible = () => state.visible
  window.isMinimized = () => state.minimized
  contents.mainFrame = {}
  contents.send = (channel, visible) => messages.push({ channel, visible })
  const dispose = attachMainWindowVisibility(window, { ipcMain })
  const subscribe = (sender = contents, senderFrame = contents.mainFrame) =>
    ipcMain.emit('eden-agent:main-window-visibility-subscribe', { sender, senderFrame })
  return { window, contents, ipcMain, state, messages, dispose, subscribe }
}

test('subscriptions return the initial native state only to the primary main frame', () => {
  const f = fixture()
  f.subscribe({}, {}); f.subscribe(f.contents, {})
  assert.deepEqual(f.messages, [])
  f.subscribe()
  assert.deepEqual(f.messages, [{ channel: 'eden-agent-main-window-visibility', visible: false }])
  f.state.visible = true
  f.subscribe()
  assert.equal(f.messages.at(-1).visible, true)
})

test('show and hide publish appearance changes while focus and duplicate native events do not', () => {
  const f = fixture()
  f.state.visible = true; f.window.emit('show'); f.window.emit('show'); f.window.emit('focus')
  f.state.visible = false; f.window.emit('hide'); f.window.emit('hide')
  f.state.visible = true; f.window.emit('show')
  assert.deepEqual(f.messages.map(message => message.visible), [true, false, true])
})

test('minimizing and restoring reflect actual visibility without a second show notification', () => {
  const f = fixture()
  f.state.visible = true; f.window.emit('show')
  f.state.minimized = true; f.window.emit('minimize'); f.window.emit('show')
  f.state.minimized = false; f.window.emit('restore'); f.window.emit('show')
  assert.deepEqual(f.messages.map(message => message.visible), [true, false, true])
})

test('closing or destroying the primary surface cleans subscriptions and late events', () => {
  for (const event of ['closed', 'destroyed']) {
    const f = fixture()
    ;(event === 'closed' ? f.window : f.contents).emit(event)
    f.subscribe(); f.window.emit('show'); f.dispose()
    assert.deepEqual(f.messages, [])
    assert.equal(f.ipcMain.listenerCount('eden-agent:main-window-visibility-subscribe'), 0)
    for (const name of ['show', 'hide', 'minimize', 'restore']) assert.equal(f.window.listenerCount(name), 0)
  }
})

test('a destroyed native window cannot publish even before its closed event arrives', () => {
  const f = fixture()
  f.state.destroyed = true
  f.subscribe(); f.window.emit('show')
  assert.deepEqual(f.messages, [])
})
