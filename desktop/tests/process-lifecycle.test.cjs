const assert = require("node:assert/strict")
const test = require("node:test")

const { createProcessLifecycle, isOutputPipeError } = require("../src/processes/process-lifecycle.cjs")

test("recognizes output pipe failures", () => {
  assert.equal(isOutputPipeError({ code: "EPIPE" }), true)
  assert.equal(isOutputPipeError({ code: "ERR_STREAM_DESTROYED" }), true)
  assert.equal(isOutputPipeError({ code: "EACCES" }), false)
})

test("a missing development parent stops the watcher and quits once", () => {
  let quitting = false
  let quitCount = 0
  let watchCallback = null
  let clearedTimer = null
  const timer = { unrefCalled: false, unref() { this.unrefCalled = true } }
  const processObject = {
    env: { EDEN_AGENT_DEV_PARENT_PID: "321" },
    kill(pid, signal) {
      assert.equal(pid, 321)
      assert.equal(signal, 0)
      throw new Error("missing")
    },
  }
  const lifecycle = createProcessLifecycle({
    app: { quit() { quitCount += 1 } },
    processObject,
    getIsQuitting: () => quitting,
    markQuitting: () => { quitting = true },
    setIntervalFn(callback, interval) {
      assert.equal(interval, 750)
      watchCallback = callback
      return timer
    },
    clearIntervalFn(nextTimer) { clearedTimer = nextTimer },
  })

  assert.equal(lifecycle.startDevParentWatch(), true)
  assert.equal(timer.unrefCalled, true)
  watchCallback()
  assert.equal(clearedTimer, timer)
  assert.equal(quitting, true)
  assert.equal(quitCount, 1)
  assert.equal(lifecycle.stopDevParentWatch(), false)
})

test("broken output pipes trigger the shared quit path", () => {
  let quitting = false
  let quitCount = 0
  const lifecycle = createProcessLifecycle({
    app: { quit() { quitCount += 1 } },
    processObject: {},
    getIsQuitting: () => quitting,
    markQuitting: () => { quitting = true },
  })

  assert.equal(lifecycle.handleOutputError({ code: "EPIPE" }), true)
  assert.equal(lifecycle.handleOutputError({ code: "EPIPE" }), false)
  assert.equal(quitCount, 1)
})
