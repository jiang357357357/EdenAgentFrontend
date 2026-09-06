import assert from "node:assert/strict"
import { after, beforeEach, afterEach, test } from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { createServer } from "vite"

const originalWindow = globalThis.window
const originalWebSocket = globalThis.WebSocket
let origin = "mon"
const sockets = []

class FakeWebSocket extends EventTarget {
  static OPEN = 1
  readyState = 1
  requests = []

  constructor(url) {
    super()
    this.url = url
    sockets.push(this)
    queueMicrotask(() => this.dispatchEvent(new Event("open")))
  }

  send(raw) {
    const request = JSON.parse(raw)
    this.requests.push(request)
    const result = request.method === "initialize"
      ? { runtimeOrigin: request.params.runtimeOrigin }
      : []
    queueMicrotask(() => this.receive({ id: request.id, result }))
  }

  receive(message) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }))
  }

  close() {
    if (this.readyState === 3) return
    this.readyState = 3
    this.dispatchEvent(new Event("close"))
  }
}

globalThis.WebSocket = FakeWebSocket
globalThis.window = {
  localStorage: { getItem: () => origin },
  edenAgentDesktop: { getAgentCapability: async () => ({ token: "test-capability" }) },
}
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
const transport = await vite.ssrLoadModule("/src/lib/rpc-transport.ts")
const reducer = await vite.ssrLoadModule("/src/lib/session-reducer.ts")
let unsubscribe

async function until(predicate) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await delay(10)
  }
  assert.fail("timed out waiting for RPC recovery")
}

function event(socket, sessionId, seq) {
  socket.receive({
    method: "session.event",
    params: { id: `${sessionId}-${seq}`, sessionId, seq, eventType: "turn.completed", payload: {} },
  })
}

beforeEach(() => { origin = "mon"; sockets.length = 0 })
afterEach(() => {
  unsubscribe?.()
  unsubscribe = undefined
  for (const socket of sockets) socket.close()
})
after(async () => {
  await vite.close()
  globalThis.window = originalWindow
  globalThis.WebSocket = originalWebSocket
})

test("lag warning reconnects and invokes snapshot reconciliation without replaying events", async () => {
  const received = []
  let opens = 0
  let reconciled = false
  unsubscribe = await transport.subscribeRpcEvents((value) => received.push(value), (connected) => {
    if (connected && ++opens > 1) {
      void transport.rpcRequest("session.list", {}).then(() => { reconciled = true })
    }
  })
  await until(() => opens === 1)
  const first = sockets[0]
  event(first, "a", 50)
  first.receive({ method: "server.warning", params: { code: "event_stream_lagged", skipped: 10 } })
  first.receive({ method: "server.warning", params: { code: "event_stream_lagged", skipped: 10 } })
  event(first, "a", 61)
  await until(() => reconciled)
  assert.equal(sockets.length, 2)
  assert.deepEqual(received.map((value) => value.seq), [50])
  assert.ok(sockets[1].requests.some((request) => request.method === "session.list"))
  event(sockets[1], "a", 100)
  assert.deepEqual(received.map((value) => value.seq), [50, 100])
})

test("sequence gaps trigger recovery while duplicates and independent sessions do not", async () => {
  const received = []
  let opens = 0
  unsubscribe = await transport.subscribeRpcEvents((value) => received.push(value), (connected) => {
    if (connected) opens += 1
  })
  await until(() => opens === 1)
  const first = sockets[0]
  event(first, "a", 40)
  event(first, "b", 90)
  event(first, "a", 40)
  event(first, "a", 39)
  event(first, "a", 41)
  assert.equal(first.readyState, FakeWebSocket.OPEN)
  event(first, "a", 43)
  await until(() => opens === 2)
  assert.deepEqual(received.map((value) => value.id), ["a-40", "b-90", "a-41"])
})

test("unrelated warnings leave the connection open", async () => {
  let connected = false
  unsubscribe = await transport.subscribeRpcEvents(() => {}, (value) => { connected = value })
  await until(() => connected)
  sockets[0].receive({ method: "server.warning", params: { code: "unrelated_warning" } })
  assert.equal(sockets[0].readyState, FakeWebSocket.OPEN)
  assert.equal(connected, true)
})

test("switching realms discards notifications from the old connection", async () => {
  const received = []
  let connected = false
  unsubscribe = await transport.subscribeRpcEvents((value) => received.push(value), (value) => { connected = value })
  await until(() => connected)
  const first = sockets[0]
  origin = "local"
  event(first, "a", 1)
  await transport.rpcRequest("session.list", {})
  event(first, "a", 2)
  event(sockets[1], "a", 1)
  assert.equal(sockets.length, 2)
  assert.match(sockets[1].url, /40093/)
  assert.deepEqual(received.map((value) => value.seq), [1])
})

test("recovery invalidates inactive caches without discarding messages or mutating prior state", () => {
  const active = { id: "a", hydrated: true, messages: {} }
  const inactive = { id: "b", hydrated: true, messages: { saved: { id: "saved" } } }
  const state = { ...reducer.initialRuntimeState, sessions: { a: active, b: inactive }, activeSessionId: "a" }
  const recovered = reducer.runtimeReducer(state, reducer.invalidateInactiveSessions())
  assert.equal(recovered.sessions.a, active)
  assert.equal(recovered.sessions.b.hydrated, false)
  assert.equal(recovered.sessions.b.messages, inactive.messages)
  assert.equal(state.sessions.b.hydrated, true)
})
