const assert = require("node:assert/strict")
const test = require("node:test")
const { EventEmitter } = require("node:events")
const { attachWindowRepaint } = require("../src/windows/window-repaint.cjs")

function fixture() {
  const window = new EventEmitter()
  const contents = new EventEmitter()
  let repaints = 0
  let callback = null
  window.webContents = contents
  window.isDestroyed = () => false
  window.isMinimized = () => false
  contents.isDestroyed = () => false
  contents.invalidate = () => { repaints += 1 }
  const dispose = attachWindowRepaint(window, {
    schedule(next) { callback = next; return 1 },
    cancel() { callback = null },
  })
  return { window, contents, dispose, repaints: () => repaints, flush() { const next = callback; callback = null; next?.() } }
}

test("native resize and maximize events coalesce into a full surface repaint", () => {
  const f = fixture()
  f.window.emit("resize")
  f.window.emit("maximize")
  f.contents.emit("did-finish-load")
  assert.equal(f.repaints(), 0)
  f.flush()
  assert.equal(f.repaints(), 1)
  f.window.emit("restore")
  f.flush()
  assert.equal(f.repaints(), 2)
})

test("closing a window cancels pending redraws and removes listeners", () => {
  const f = fixture()
  f.window.emit("show")
  f.window.emit("closed")
  f.flush()
  f.window.emit("resize")
  f.contents.emit("did-finish-load")
  f.flush()
  assert.equal(f.repaints(), 0)
  assert.equal(f.window.listenerCount("resize"), 0)
  f.dispose()
})

test("a minimized or destroyed surface is skipped", () => {
  const f = fixture()
  f.window.isMinimized = () => true
  f.window.emit("resize")
  f.flush()
  f.window.isMinimized = () => false
  f.contents.isDestroyed = () => true
  f.window.emit("restore")
  f.flush()
  assert.equal(f.repaints(), 0)
})
