import assert from "node:assert/strict"
import { after, beforeEach, afterEach, test } from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { createServer } from "vite"

const originalWindow = globalThis.window
const originalWebSocket = globalThis.WebSocket
let origin = "mon"
let initializationClose
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
    if (request.method === "initialize" && initializationClose) {
      queueMicrotask(() => this.close(initializationClose.code, initializationClose.reason))
      return
    }
    const result = request.method === "initialize"
      ? { protocolVersion: 2, serverName: 'fixture', serverVersion: '2', agentCoreVersion: 'pi-test', capabilities: [], runtimeOrigin: request.params.runtimeOrigin }
      : []
    queueMicrotask(() => this.receive({ id: request.id, result }))
  }

  receive(message) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ jsonrpc: "2.0", ...message }) }))
  }

  close(code = 1000, reason = '') {
    if (this.readyState === 3) return
    this.readyState = 3
    this.dispatchEvent(Object.assign(new Event("close"), { code, reason, wasClean: code !== 1006 }))
  }
}

globalThis.WebSocket = FakeWebSocket
const windowEvents = new EventTarget()
globalThis.window = { addEventListener: windowEvents.addEventListener.bind(windowEvents), removeEventListener: windowEvents.removeEventListener.bind(windowEvents), dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents),
  localStorage: { getItem: () => origin },
  edenAgentDesktop: { getAgentCapability: async () => ({ token: "test-capability" }) },
}
const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" })
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

const eventId = (sessionId, seq) => `00000000-0000-4000-8000-${sessionId === "a" ? "1" : "2"}${String(seq).padStart(11, "0")}`
function event(socket, sessionId, seq) {
  socket.receive({
    method: "session.event",
    params: { id: eventId(sessionId, seq), sessionId: eventId(sessionId, 0), turnId: null, seq: String(seq), createdAt: 1, eventType: "turn.completed", payload: {} },
  })
}

beforeEach(() => { origin = "mon"; sockets.length = 0; initializationClose = undefined })
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
  assert.deepEqual(received.map((value) => Number(value.seq)), [50])
  assert.ok(sockets[1].requests.some((request) => request.method === "session.list"))
  event(sockets[1], "a", 100)
  assert.deepEqual(received.map((value) => Number(value.seq)), [50, 100])
})

test("sequence gaps trigger recovery while duplicates and independent sessions do not", async () => {
  const received = []
  const diagnostics = []
  let opens = 0
  unsubscribe = await transport.subscribeRpcEvents((value) => received.push(value), (connected, error) => {
    if (connected) opens += 1
    else diagnostics.push(error)
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
  assert.deepEqual(diagnostics, ["会话状态需要重新同步"])
  await until(() => opens === 2)
  assert.deepEqual(received.map((value) => value.id), [eventId("a", 40), eventId("b", 90), eventId("a", 41)])
  assert.deepEqual(sockets.flatMap(socket => socket.requests.map(request => request.method)), ["initialize", "initialize"])
})

test("unrelated warnings leave the connection open", async () => {
  let connected = false
  unsubscribe = await transport.subscribeRpcEvents(() => {}, (value) => { connected = value })
  await until(() => connected)
  sockets[0].receive({ method: "server.warning", params: { code: "unrelated_warning" } })
  assert.equal(sockets[0].readyState, FakeWebSocket.OPEN)
  assert.equal(connected, true)
})

test("authentication close during initialization retains its cause before the connection opens", async () => {
  initializationClose = { code: 1008, reason: "Core account authentication failed" }
  const statuses = []
  unsubscribe = await transport.subscribeRpcEvents(() => {}, (connected, error) => statuses.push({ connected, error }))
  await until(() => statuses.length > 0)
  assert.deepEqual(statuses, [{ connected: false, error: "Core 账号验证失败，连接已中断" }])
  assert.deepEqual(sockets[0].requests.map(request => request.method), ["initialize"])
})

for (const [code, reason, message] of [
  [1008, 'Core account authentication failed', 'Core 账号验证失败，连接已中断'],
  [1008, 'Request queue limit exceeded', '连接请求过于频繁，服务已关闭连接'],
  [1013, 'Event consumer did not drain the connection', '客户端接收速度过慢，连接已中断'],
  [1006, '', '与服务的网络连接意外中断'],
  [1011, 'Durable event delivery failed', '服务处理异常，连接已中断'],
]) {
  test(`transport reports the original remote close category for ${code}: ${reason}`, async () => {
    const statuses = []
    unsubscribe = await transport.subscribeRpcEvents(() => {}, (connected, error) => statuses.push({ connected, error }))
    await until(() => statuses[0]?.connected)
    sockets[0].close(code, reason)
    assert.deepEqual(statuses, [{ connected: true, error: undefined }, { connected: false, error: message }])
    assert.deepEqual(sockets[0].requests.map(request => request.method), ['initialize'])
  })
}

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
  assert.deepEqual(received.map((value) => Number(value.seq)), [1])
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
