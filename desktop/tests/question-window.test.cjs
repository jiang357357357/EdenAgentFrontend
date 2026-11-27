const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { createQuestionWindowController } = require('../src/windows/question-window.cjs')
const { createDesktopQuitFlagController } = require('../src/processes/desktop-quit-flag.cjs')
const { createQuestionControllerFromMain } = require('./fixtures/question-window-wiring.cjs')

function fixture(createController = createQuestionWindowController) {
  const windows = [], owner = {}, attached = [], loaded = []
  let quitting = false
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new EventEmitter(); windows.push(this) }
    isDestroyed() { return Boolean(this.destroyed) }
    isMinimized() { return Boolean(this.minimized) }
    restore() { this.minimized = false }
    show() { this.visible = true }
    hide() { this.visible = false }
    focus() { this.focused = true }
    setAlwaysOnTop(value) { this.topmost = value }
    destroy() { this.destroyed = true; this.emit('closed') }
  }
  const controller = createController({ BrowserWindow: Window,
    screen: { getCursorScreenPoint: () => ({}), getDisplayNearestPoint: () => ({ workArea: { width: 1920, height: 1080 } }) },
    preload: '/fixture/preload.cjs', resolveIcon: () => 'icon', load: window => loaded.push(window), attach: window => attached.push(window),
    quitting: () => quitting, owner: () => owner })
  return { controller, windows, owner, attached, loaded, quit: () => { quitting = true } }
}

test('decision renderer is unthrottled and only the primary renderer can show or hide it', () => {
  const f = fixture()
  assert.equal(f.controller.setVisible(f.owner, false), true)
  assert.equal(f.windows.length, 0, 'an empty state never creates a hidden window')
  assert.equal(f.controller.setVisible(f.owner, true), true)
  const window = f.windows[0]
  assert.equal(window.options.webPreferences.backgroundThrottling, false)
  assert.equal(window.visible, true); assert.equal(window.focused, true)
  assert.throws(() => f.controller.setVisible(window.webContents, false), /只有主窗口/)
  assert.equal(window.visible, true, 'the empty auxiliary store cannot hide the native window')
  assert.equal(f.attached.length, 1); assert.equal(f.loaded.length, 1)
})

test('manual hiding remains reopenable and renderer crashes recreate a fresh decision window', () => {
  const f = fixture()
  f.controller.setVisible(f.owner, true)
  const first = f.windows[0]; let prevented = false
  first.emit('close', { preventDefault() { prevented = true } })
  assert.equal(prevented, true); assert.equal(first.visible, false)
  f.controller.setVisible(f.owner, true)
  assert.equal(first.visible, true); assert.equal(f.windows.length, 1)
  first.webContents.emit('render-process-gone')
  f.controller.setVisible(f.owner, true)
  assert.equal(first.destroyed, true); assert.equal(f.windows.length, 2)
  f.quit(); prevented = false
  f.windows[1].emit('close', { preventDefault() { prevented = true } })
  assert.equal(prevented, false)
})

test('main-process wiring hides and reopens manual closes and permits both coordinated quit paths', t => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'eden-question-quit-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const quitFlagPath = path.join(scratch, 'desktop-quit.flag')
  const quitFlagController = createDesktopQuitFlagController({ quitFlagPath,
    environment: { EDEN_AGENT_DESKTOP_QUIT_FLAG: quitFlagPath } })
  const f = fixture(dependencies => createQuestionControllerFromMain({ ...dependencies, quitFlagController }))
  f.controller.setVisible(f.owner, true)
  const window = f.windows[0]
  const close = () => {
    let prevented = false
    window.emit('close', { preventDefault() { prevented = true } })
    return prevented
  }
  assert.equal(close(), true, 'manual close must hide without throwing in the production callback')
  assert.equal(window.visible, false)
  f.controller.setVisible(f.owner, true)
  assert.equal(window.visible, true)
  assert.equal(f.windows.length, 1)
  assert.equal(quitFlagController.signalQuit(), true)
  assert.equal(close(), false, 'an external quit flag permits native window closure')
  quitFlagController.removeQuitFlag()
  assert.equal(close(), true, 'the current flag state is read again on each close')
  f.quit()
  assert.equal(close(), false, 'an in-process quit also permits native window closure')
})
