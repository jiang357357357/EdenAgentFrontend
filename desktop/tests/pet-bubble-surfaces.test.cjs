const assert = require("node:assert/strict")
const test = require("node:test")

const {
  resolvePetBubbleSurfaceVisibility,
  setWindowVisibleWithoutActivation,
} = require("../src/pet/pet-bubble-surfaces.cjs")

function createWindow({ visible = false, destroyed = false } = {}) {
  const calls = []
  return {
    calls,
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    setSkipTaskbar: (value) => calls.push(`skipTaskbar:${value}`),
    showInactive: () => {
      calls.push("showInactive")
      visible = true
    },
    hide: () => {
      calls.push("hide")
      visible = false
    },
  }
}

test("expanded and collapsed states select exactly one fixed interaction surface", () => {
  assert.deepEqual(
    resolvePetBubbleSurfaceVisibility({ characterVisible: true, showInput: true, collapsed: false }),
    { panelVisible: true, iconVisible: false },
  )
  assert.deepEqual(
    resolvePetBubbleSurfaceVisibility({ characterVisible: true, showInput: true, collapsed: true }),
    { panelVisible: false, iconVisible: true },
  )
})

test("hidden character or disabled input hides both interaction surfaces", () => {
  assert.deepEqual(
    resolvePetBubbleSurfaceVisibility({ characterVisible: false, showInput: true, collapsed: false }),
    { panelVisible: false, iconVisible: false },
  )
  assert.deepEqual(
    resolvePetBubbleSurfaceVisibility({ characterVisible: true, showInput: false, collapsed: true }),
    { panelVisible: false, iconVisible: false },
  )
})

test("surface visibility changes use showInactive and never repeat an unchanged operation", () => {
  const window = createWindow()
  assert.equal(setWindowVisibleWithoutActivation(window, true), true)
  assert.deepEqual(window.calls, ["skipTaskbar:true", "showInactive"])
  window.calls.length = 0
  assert.equal(setWindowVisibleWithoutActivation(window, true), true)
  assert.deepEqual(window.calls, ["skipTaskbar:true"])
  window.calls.length = 0
  assert.equal(setWindowVisibleWithoutActivation(window, false), true)
  assert.deepEqual(window.calls, ["hide"])
})

test("destroyed surfaces are ignored", () => {
  const window = createWindow({ destroyed: true })
  assert.equal(setWindowVisibleWithoutActivation(window, true), false)
  assert.deepEqual(window.calls, [])
})
