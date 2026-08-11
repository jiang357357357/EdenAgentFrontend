const assert = require("node:assert/strict")
const test = require("node:test")

const {
  createPetMousePassthroughController,
} = require("../src/pet/pet-mouse-passthrough.cjs")

function createFakeTimers() {
  let nextId = 1
  const callbacks = new Map()
  return {
    callbacks,
    setTimer(callback) {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    },
    clearTimer(id) {
      callbacks.delete(id)
    },
    runAll() {
      for (const [id, callback] of [...callbacks]) {
        callbacks.delete(id)
        callback()
      }
    },
  }
}

test("applies the current click-through state to the character window", () => {
  const calls = []
  let enabled = true
  const targetWindow = {
    isDestroyed: () => false,
    setIgnoreMouseEvents: (value) => calls.push(value),
  }
  const controller = createPetMousePassthroughController({
    getWindow: () => targetWindow,
    getClickThrough: () => enabled,
  })

  assert.equal(controller.apply(), true)
  enabled = false
  assert.equal(controller.apply(), true)
  assert.deepEqual(calls, [true, false])
})

test("reapplies click-through after the native bounds settle", () => {
  const timers = createFakeTimers()
  const calls = []
  let enabled = true
  const controller = createPetMousePassthroughController({
    getWindow: () => ({
      isDestroyed: () => false,
      setIgnoreMouseEvents: (value) => calls.push(value),
    }),
    getClickThrough: () => enabled,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })

  controller.reapplyAfterBoundsChange()
  assert.deepEqual(calls, [true])
  assert.equal(timers.callbacks.size, 1)

  enabled = false
  timers.runAll()
  assert.deepEqual(calls, [true, false])
})

test("repeated bounds changes keep only the latest delayed reapply", () => {
  const timers = createFakeTimers()
  const calls = []
  const targetWindow = {
    isDestroyed: () => false,
    setIgnoreMouseEvents: (value) => calls.push(value),
  }
  const controller = createPetMousePassthroughController({
    getWindow: () => targetWindow,
    getClickThrough: () => true,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })

  controller.reapplyAfterBoundsChange()
  controller.reapplyAfterBoundsChange()
  assert.equal(timers.callbacks.size, 1)
  timers.runAll()
  assert.deepEqual(calls, [true, true, true])
})

test("does not touch a destroyed character window", () => {
  const controller = createPetMousePassthroughController({
    getWindow: () => ({
      isDestroyed: () => true,
      setIgnoreMouseEvents: () => assert.fail("destroyed window must not be mutated"),
    }),
    getClickThrough: () => true,
  })

  assert.equal(controller.apply(), false)
})
