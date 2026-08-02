const assert = require("node:assert/strict")
const test = require("node:test")

const {
  applyBubbleKeyboardFocus,
  makeWindowNonActivating,
} = require("../src/pet/pet-window-focus.cjs")

function createWindow({ focused = false, visible = true, focusable = true, topmost = false } = {}) {
  const calls = []
  return {
    calls,
    isDestroyed: () => false,
    isFocused: () => focused,
    isVisible: () => visible,
    blur: () => {
      calls.push("blur")
      focused = false
    },
    isFocusable: () => focusable,
    setFocusable: (value) => {
      calls.push(`focusable:${value}`)
      focusable = value
    },
    isAlwaysOnTop: () => topmost,
    setAlwaysOnTop: (value) => {
      calls.push(`topmost:${value}`)
      topmost = value
    },
    showInactive: () => {
      calls.push("showInactive")
      visible = true
    },
    focus: () => {
      calls.push("focus")
      focused = true
    },
  }
}

test("desktop character interactions never activate the character window", () => {
  const window = createWindow({ focused: true })
  assert.equal(makeWindowNonActivating(window), true)
  assert.deepEqual(window.calls, ["blur", "focusable:false"])
})

test("collapsed and ordinary bubble interactions remain non-activating and topmost", () => {
  const window = createWindow({ focused: true })
  assert.equal(applyBubbleKeyboardFocus(window, true, true, true), false)
  assert.deepEqual(window.calls, ["blur", "focusable:false", "topmost:true"])
})

test("only an explicit text-input request activates the expanded bubble and restores topmost", () => {
  const window = createWindow({ visible: false, focusable: false, topmost: true })
  assert.equal(applyBubbleKeyboardFocus(window, true, false, true), true)
  assert.deepEqual(window.calls, ["focusable:true", "showInactive", "focus", "topmost:true"])
})

test("an unchanged non-activating topmost policy does not mutate native window styles", () => {
  const window = createWindow()
  window.setFocusable(false)
  window.setAlwaysOnTop(true)
  window.calls.length = 0
  assert.equal(applyBubbleKeyboardFocus(window, false, false, true), false)
  assert.deepEqual(window.calls, [])
})
