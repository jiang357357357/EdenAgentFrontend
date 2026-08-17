const assert = require("node:assert/strict")
const test = require("node:test")

const {
  applyBubbleKeyboardFocus,
  makeWindowNonActivating,
  reassertWindowTopmost,
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
    setAlwaysOnTop: (value, level) => {
      calls.push(`topmost:${value}${level ? `:${level}` : ""}`)
      topmost = value
    },
    moveTop: () => calls.push("moveTop"),
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
  assert.equal(makeWindowNonActivating(window, "win32"), true)
  assert.deepEqual(window.calls, ["blur", "focusable:false"])
})

test("Linux character stays managed while incidental focus is removed", () => {
  const window = createWindow({ focused: true, focusable: true })
  assert.equal(makeWindowNonActivating(window, "linux"), true)
  assert.deepEqual(window.calls, ["blur"])
})

test("collapsed and ordinary bubble interactions remain non-activating and topmost", () => {
  const window = createWindow({ focused: true })
  assert.equal(applyBubbleKeyboardFocus(window, true, true, true, "win32"), false)
  assert.deepEqual(window.calls, ["blur", "focusable:false", "topmost:true"])
})

test("only an explicit text-input request activates the expanded bubble and restores topmost", () => {
  const window = createWindow({ visible: false, focusable: false, topmost: true })
  assert.equal(applyBubbleKeyboardFocus(window, true, false, true, "win32"), true)
  assert.deepEqual(window.calls, ["focusable:true", "showInactive", "topmost:true", "focus"])
})

test("text input focus is the final native mutation even when topmost changes", () => {
  const window = createWindow({ focusable: false, topmost: false })
  assert.equal(applyBubbleKeyboardFocus(window, true, false, true, "win32"), true)
  assert.deepEqual(window.calls, ["focusable:true", "topmost:true", "focus"])
})

test("an unchanged non-activating topmost policy does not mutate native window styles", () => {
  const window = createWindow()
  window.setFocusable(false)
  window.setAlwaysOnTop(true)
  window.calls.length = 0
  assert.equal(applyBubbleKeyboardFocus(window, false, false, true, "win32"), false)
  assert.deepEqual(window.calls, [])
})

test("Electron topmost is reasserted even when its cached state already says true", () => {
  const window = createWindow({ visible: true, topmost: true })
  assert.equal(reassertWindowTopmost(window, true), true)
  assert.deepEqual(window.calls, ["topmost:true:screen-saver", "moveTop"])
})

test("topmost levels can keep interaction surfaces below the character", () => {
  const window = createWindow({ visible: true, topmost: true })
  assert.equal(reassertWindowTopmost(window, true, "floating"), true)
  assert.deepEqual(window.calls, ["topmost:true:floating", "moveTop"])
})

test("disabling topmost does not move the window to the front", () => {
  const window = createWindow({ visible: true, topmost: true })
  assert.equal(reassertWindowTopmost(window, false), true)
  assert.deepEqual(window.calls, ["topmost:false"])
})

test("Linux keeps the initially focusable bubble capable of receiving keyboard input", () => {
  const window = createWindow({ focused: true, focusable: true, topmost: true })
  assert.equal(applyBubbleKeyboardFocus(window, false, false, true, "linux"), false)
  assert.deepEqual(window.calls, ["blur"])

  window.calls.length = 0
  assert.equal(applyBubbleKeyboardFocus(window, true, false, true, "linux"), true)
  assert.deepEqual(window.calls, ["focus"])
})
