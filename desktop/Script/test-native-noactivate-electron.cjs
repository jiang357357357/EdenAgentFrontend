const assert = require("node:assert/strict")
const path = require("node:path")
const { app, BrowserWindow } = require("electron")

const addon = require(path.join(
  __dirname,
  "..",
  "native",
  "win32-noactivate",
  "build",
  "Release",
  "monagent_noactivate.node",
))

app.whenReady().then(() => {
  const window = new BrowserWindow({ show: false, focusable: true })
  const ownedWindow = new BrowserWindow({ show: false, focusable: false, parent: window })
  const handle = window.getNativeWindowHandle()
  const ownedHandle = ownedWindow.getNativeWindowHandle()

  assert.equal(addon.isNoActivate(handle), false)
  assert.equal(addon.setNoActivate(handle, true), true)
  assert.equal(addon.isNoActivate(handle), true)
  assert.equal(addon.probeMouseActivate(handle), 3)
  assert.equal(addon.setNoActivate(handle, false), true)
  assert.equal(addon.isNoActivate(handle), false)
  assert.equal(addon.setTopmost(handle, true), true)
  assert.equal(addon.isTopmost(handle), true)
  assert.equal(addon.setTopmost(handle, false), true)
  assert.equal(addon.isTopmost(handle), false)

  assert.equal(addon.setTopmost(ownedHandle, true), true)
  assert.equal(addon.setTopmost(handle, true), true)
  assert.equal(addon.isTopmost(ownedHandle), true)
  assert.equal(addon.isTopmost(handle), true)

  ownedWindow.destroy()
  window.destroy()
  console.log("[native] Electron HWND no-activate smoke check passed")
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
