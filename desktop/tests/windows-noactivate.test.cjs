const assert = require("node:assert/strict")
const test = require("node:test")

const { createWindowsNoActivateController } = require("../src/windows-noactivate.cjs")

function createWindow({ destroyed = false } = {}) {
  const handle = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
  return {
    handle,
    isDestroyed: () => destroyed,
    getNativeWindowHandle: () => handle,
  }
}

test("Windows forwards the Electron HWND and requested activation policy to the native addon", () => {
  const calls = []
  const controller = createWindowsNoActivateController({
    platform: "win32",
    bindingLoader: () => ({
      setNoActivate: (handle, enabled) => {
        calls.push({ handle, enabled })
        return true
      },
      setTopmost: (handle, enabled) => {
        calls.push({ handle, topmost: enabled })
        return true
      },
    }),
  })
  const window = createWindow()

  assert.equal(controller.apply(window, true), true)
  assert.equal(controller.apply(window, false), true)
  assert.deepEqual(calls, [
    { handle: window.handle, enabled: true },
    { handle: window.handle, enabled: false },
  ])

  calls.length = 0
  assert.equal(controller.applyTopmost(window, true), true)
  assert.equal(controller.applyTopmost(window, false), true)
  assert.deepEqual(calls, [
    { handle: window.handle, topmost: true },
    { handle: window.handle, topmost: false },
  ])
})

test("other platforms and destroyed windows never load or call the native addon", () => {
  let loads = 0
  const load = () => {
    loads += 1
    return { setNoActivate: () => true }
  }
  const linuxController = createWindowsNoActivateController({ platform: "linux", bindingLoader: load })
  const windowsController = createWindowsNoActivateController({ platform: "win32", bindingLoader: load })

  assert.equal(linuxController.apply(createWindow(), true), false)
  assert.equal(linuxController.applyTopmost(createWindow(), true), false)
  assert.equal(windowsController.apply(createWindow({ destroyed: true }), true), false)
  assert.equal(windowsController.applyTopmost(createWindow({ destroyed: true }), true), false)
  assert.equal(loads, 0)
})

test("a missing native addon is reported once and Electron can continue with its fallback policy", () => {
  const errors = []
  const controller = createWindowsNoActivateController({
    platform: "win32",
    bindingLoader: () => {
      throw new Error("binding missing")
    },
    logger: { error: (message) => errors.push(message) },
  })

  assert.equal(controller.apply(createWindow(), true), false)
  assert.equal(controller.apply(createWindow(), true), false)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /binding missing/)
})
