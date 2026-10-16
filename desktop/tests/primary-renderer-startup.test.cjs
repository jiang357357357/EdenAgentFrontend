const assert = require('node:assert/strict')
const { test } = require('node:test')
const { EventEmitter } = require('node:events')
const { attachPrimaryRendererStartup } = require('../src/windows/primary-renderer-startup.cjs')

function fixture() {
  const window = new EventEmitter(), contents = new EventEmitter(), ipcMain = new EventEmitter()
  let starts = 0, destroyed = false, repaints = 0
  const throttling = []
  window.webContents = contents
  window.isDestroyed = contents.isDestroyed = () => destroyed
  contents.mainFrame = {}
  contents.setBackgroundThrottling = value => throttling.push(value)
  contents.invalidate = () => { repaints++ }
  attachPrimaryRendererStartup(window, { ipcMain, onReady: () => { starts++ } })
  return { window, contents, ipcMain, throttling, starts: () => starts, repaints: () => repaints,
    ready(sender = contents, senderFrame = contents.mainFrame) {
      ipcMain.emit('eden-agent:renderer-ready', { sender, senderFrame })
    },
    close() { destroyed = true; window.emit('closed') },
  }
}

test('native readiness and a loaded document cannot open reminders before React paints', () => {
  const f = fixture()
  f.window.emit('ready-to-show')
  f.contents.emit('did-finish-load')
  assert.equal(f.starts(), 0)
  f.ready({}, {}) // A question or reminder renderer cannot release the primary gate.
  f.ready(f.contents, {}) // Neither can a frame embedded in the primary window.
  assert.equal(f.starts(), 0)
  f.ready()
  assert.equal(f.starts(), 1)
  assert.equal(f.repaints(), 1)
  assert.deepEqual(f.throttling, [true])
  f.ready(); f.contents.emit('did-finish-load'); f.window.emit('ready-to-show')
  assert.equal(f.starts(), 1)
})

test('an early React signal waits for the native surface and document load', () => {
  const f = fixture()
  f.ready()
  f.window.emit('ready-to-show')
  assert.equal(f.starts(), 0)
  f.contents.emit('did-finish-load')
  assert.equal(f.starts(), 1)
})

test('navigation discards a readiness signal from the previous document', () => {
  for (const args of [[{}, 'http://fixture/', false, true], [{ isMainFrame: true, isSameDocument: false }]]) {
    const f = fixture()
    f.ready()
    f.contents.emit('did-start-navigation', ...args)
    f.contents.emit('did-finish-load')
    f.window.emit('ready-to-show')
    assert.equal(f.starts(), 0)
    f.ready()
    assert.equal(f.starts(), 1)
  }
})

test('closing during startup removes listeners and late IPC cannot start auxiliary work', () => {
  const f = fixture()
  f.contents.emit('did-finish-load')
  f.close()
  f.ready(); f.window.emit('ready-to-show')
  assert.equal(f.starts(), 0)
  assert.equal(f.ipcMain.listenerCount('eden-agent:renderer-ready'), 0)
  assert.equal(f.contents.listenerCount('did-finish-load'), 0)
  assert.equal(f.contents.listenerCount('did-start-navigation'), 0)
})
