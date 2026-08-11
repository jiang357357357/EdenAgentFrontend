const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const { PassThrough } = require("node:stream")
const test = require("node:test")

const {
  POINTER_EVENT_CHANNEL,
  createGlobalPointerObserver,
  parseJsonLines,
  pointInsideBounds,
} = require("../src/pet/global-pointer-observer.cjs")

function fakeChild() {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.kill = () => {
    child.killed = true
  }
  return child
}

test("pointer helper JSON lines tolerate fragmented and malformed output", () => {
  const first = parseJsonLines("", '{"type":"rea')
  assert.deepEqual(first.records, [])
  const second = parseJsonLines(first.remainder, 'dy"}\nnot-json\n{"type":"down"}\n')
  assert.deepEqual(second.records, [{ type: "ready" }, { type: "down" }])
  assert.equal(second.remainder, "")
})

test("screen points use half-open Electron window bounds", () => {
  const bounds = { x: 100, y: 200, width: 300, height: 400 }
  assert.equal(pointInsideBounds({ x: 100, y: 200 }, bounds), true)
  assert.equal(pointInsideBounds({ x: 399, y: 599 }, bounds), true)
  assert.equal(pointInsideBounds({ x: 400, y: 600 }, bounds), false)
})

test("observer mirrors left-button input without consuming the underlying click", async () => {
  const child = fakeChild()
  const sent = []
  const target = {
    isDestroyed: () => false,
    isVisible: () => true,
    getBounds: () => ({ x: 100, y: 200, width: 300, height: 400 }),
    webContents: {
      isDestroyed: () => false,
      send: (channel, payload) => sent.push({ channel, payload }),
    },
  }
  const observer = createGlobalPointerObserver({
    platform: "win32",
    executablePath: "observer.exe",
    fileExists: () => true,
    spawnProcess: () => child,
    getCursorPoint: () => ({ x: 150, y: 260 }),
    getTargetWindow: () => target,
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
    logger: { warn() {} },
  })

  assert.equal(observer.setEnabled(true), true)
  child.stdout.write('{"type":"down","button":"left"}\n')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(sent.length, 1)
  assert.equal(sent[0].channel, POINTER_EVENT_CHANNEL)
  assert.deepEqual(
    { phase: sent[0].payload.phase, clientX: sent[0].payload.clientX, clientY: sent[0].payload.clientY },
    { phase: "down", clientX: 50, clientY: 60 },
  )

  child.stdout.write('{"type":"up","button":"left"}\n')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(sent[1].payload.phase, "up")
  observer.dispose()
  assert.equal(child.killed, true)
})

test("observer does not start when its optional helper is unavailable", () => {
  let spawns = 0
  const observer = createGlobalPointerObserver({
    platform: "win32",
    executablePath: "missing.exe",
    fileExists: () => false,
    spawnProcess: () => {
      spawns += 1
    },
    logger: { warn() {} },
  })
  observer.setEnabled(true)
  assert.equal(spawns, 0)
  assert.deepEqual(observer.snapshot(), { desired: true, running: false, activePointer: false })
  observer.dispose()
})
