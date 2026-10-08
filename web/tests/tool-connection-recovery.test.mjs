import assert from "node:assert/strict"
import { after, afterEach, beforeEach, test } from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { createServer } from "vite"

const originalWindow = globalThis.window
const originalWebSocket = globalThis.WebSocket
const sockets = []
const sessionId = "00000000-0000-4000-8000-000000000001"
const turnId = "00000000-0000-4000-8000-000000000002"
const assistantId = "00000000-0000-4000-8000-000000000003"
const resultId = "00000000-0000-4000-8000-000000000004"
const secondSessionId = "00000000-0000-4000-8000-000000000005"
const secondAssistantId = "00000000-0000-4000-8000-000000000006"
const windowEvents = new EventTarget()

class FakeSocket extends EventTarget {
  static OPEN = 1
  readyState = 1
  requests = []
  closes = []
  constructor() {
    super()
    sockets.push(this)
    queueMicrotask(() => this.dispatchEvent(new Event("open")))
  }
  send(raw) {
    const request = JSON.parse(raw)
    this.requests.push(request)
    const result = request.method === "initialize"
      ? { protocolVersion: 2, serverName: "fixture", serverVersion: "2", agentCoreVersion: "pi-test",
          capabilities: [], runtimeOrigin: "local" }
      : []
    queueMicrotask(() => this.receive({ id: request.id, result }))
  }
  receive(message) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ jsonrpc: "2.0", ...message }) }))
  }
  close(code, reason) {
    if (this.readyState === 3) return
    this.closes.push({ code, reason })
    this.readyState = 3
    this.dispatchEvent(new Event("close"))
  }
}

globalThis.WebSocket = FakeSocket
globalThis.window = {
  addEventListener: windowEvents.addEventListener.bind(windowEvents),
  removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
  dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents),
  localStorage: { getItem: () => "local" },
  edenAgentDesktop: { getAgentCapability: async () => ({ token: "fixture-capability" }) },
}
const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" })
const transport = await vite.ssrLoadModule("/src/lib/rpc-transport.ts")
const client = await vite.ssrLoadModule("/src/lib/agent-client.ts")
const reducer = await vite.ssrLoadModule("/src/lib/session-reducer.ts")
let unsubscribe

beforeEach(() => { sockets.length = 0 })
afterEach(() => {
  unsubscribe?.()
  unsubscribe = undefined
  windowEvents.dispatchEvent(new Event("edenagent:account-changed"))
  for (const socket of sockets) socket.close()
})
after(async () => {
  await vite.close()
  globalThis.window = originalWindow
  globalThis.WebSocket = originalWebSocket
})

async function until(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return
    await delay(10)
  }
  assert.fail("timed out waiting for tool connection recovery")
}
function event(seq, eventType, payload = {}) {
  return { id: `00000000-0000-4000-8000-${String(100 + seq).padStart(12, "0")}`,
    sessionId, turnId, seq: String(seq), eventType, payload, createdAt: 1000 + seq }
}
function emit(socket, value) { socket.receive({ method: "session.event", params: value }) }
function assistant(seq, kind = "agent.message_end") {
  return event(seq, kind, { messageId: assistantId, message: { role: "assistant", timestamp: 1000,
    content: [{ type: "toolCall", id: "call-1", name: "read_file", arguments: { path: "fixture.txt" } }] } })
}
function result(seq) {
  return event(seq, "agent.message_end", { messageId: resultId, message: { role: "toolResult",
    toolCallId: "call-1", toolName: "read_file", timestamp: 1010, isError: false,
    content: [{ type: "text", text: "fixture contents" }] } })
}
function initialState() {
  return reducer.runtimeReducer(reducer.initialRuntimeState, reducer.hydrateSessionList([
    { id: sessionId, title: "tool recovery", time: { created: 1, updated: 1 } },
  ]))
}

function toolSequence(start, targetSessionId, messageId, filename, output) {
  const events = [assistant(start, "agent.message_start"), assistant(start + 1),
    event(start + 2, "operation.started", { callId: "call-1", name: "read_file" }),
    event(start + 3, "operation.completed", { callId: "call-1", result: output, failed: false }),
    result(start + 4), event(start + 5, "turn.completed")]
  for (const value of events) {
    value.sessionId = targetSessionId
    // Deliberately reuse turn/call IDs to verify the complete session namespace.
    if (value.payload.message?.role === "assistant") {
      value.payload.messageId = messageId
      value.payload.message.content[0].arguments.path = filename
    } else if (value.payload.message?.role === "toolResult") {
      value.payload.message.content[0].text = output
    }
  }
  return events
}

test("contiguous operation events around a tool keep the frontend connected and complete one card", async () => {
  let state = initialState()
  const statuses = []
  unsubscribe = await client.subscribeEvents({
    onOpen: () => statuses.push("connected"),
    onError: () => statuses.push("disconnected"),
    onEvent: update => { state = reducer.runtimeReducer(state, reducer.applyRuntimeEvent(update)) },
  })
  await until(() => statuses.length === 1)
  const socket = sockets[0]
  for (const source of [assistant(1, "agent.message_start"), assistant(2),
    event(3, "operation.started", { callId: "call-1", name: "read_file" }),
    event(4, "operation.completed", { callId: "call-1", result: "fixture contents", failed: false }),
    result(5), event(6, "turn.completed")]) emit(socket, source)
  assert.deepEqual(statuses, ["connected"])
  assert.equal(socket.readyState, FakeSocket.OPEN)
  assert.equal(state.sessions[sessionId].messages[assistantId].parts["call-1"].state.status, "completed")
  assert.equal(state.sessions[sessionId].messageOrder.length, 1)
})

test("a missing event before operation.started makes the frontend close and reconnect without cancelling tools", async () => {
  const statuses = [], received = []
  unsubscribe = await transport.subscribeRpcEvents(value => received.push(value), value => statuses.push(value))
  await until(() => statuses.length === 1)
  emit(sockets[0], assistant(10))
  emit(sockets[0], event(12, "operation.started", { callId: "call-1", name: "read_file" }))
  assert.deepEqual(statuses, [true, false])
  assert.deepEqual(sockets[0].closes, [{ code: 1000, reason: "event sequence gap" }])
  await until(() => statuses.length === 3)
  assert.deepEqual(statuses, [true, false, true])
  assert.equal(sockets.length, 2)
  assert.deepEqual(received.map(value => value.seq), ["10"])
  assert.deepEqual(sockets.flatMap(socket => socket.requests.map(request => request.method)), ["initialize", "initialize"])
})

test("malformed operation envelopes close the frontend connection while arbitrary valid operation payloads do not", async () => {
  const statuses = []
  unsubscribe = await transport.subscribeRpcEvents(() => {}, value => statuses.push(value))
  await until(() => statuses.length === 1)
  emit(sockets[0], event(1, "operation.started", { nested: { result: [null, true, 3, "text"] } }))
  assert.deepEqual(statuses, [true])
  emit(sockets[0], { ...event(2, "operation.completed"), seq: 2 })
  assert.deepEqual(statuses, [true, false])
})

test("a completed durable snapshot after reconnect restores a single completed tool card", async () => {
  let state = initialState()
  let opened = 0
  unsubscribe = await client.subscribeEvents({
    onOpen: () => {
      if (++opened < 2) return
      state = reducer.runtimeReducer(state, reducer.hydrateSessionMessages(sessionId, {
        items: client.projectMessageEvents([assistant(1), result(3)]), hasMore: false, nextCursor: null,
      }))
    },
    onEvent: update => { state = reducer.runtimeReducer(state, reducer.applyRuntimeEvent(update)) },
  })
  await until(() => opened === 1)
  emit(sockets[0], assistant(1))
  emit(sockets[0], event(2, "operation.started", { callId: "call-1", name: "read_file" }))
  sockets[0].close(1006, "fixture network interruption")
  await until(() => opened === 2)
  const session = state.sessions[sessionId]
  assert.equal(session.messageOrder.length, 1)
  assert.equal(session.messages[assistantId].parts["call-1"].state.status, "completed")
  assert.deepEqual(session.messages[assistantId].parts["call-1"].state.input, { path: "fixture.txt" })
})

test("interleaved sessions keep independent sequence cursors and same-ID tool cards isolated", async () => {
  let state = reducer.runtimeReducer(initialState(), reducer.hydrateSessionList([
    { id: secondSessionId, title: "second tool session", time: { created: 1, updated: 1 } },
  ]))
  const statuses = []
  unsubscribe = await client.subscribeEvents({
    onOpen: () => statuses.push("connected"),
    onError: () => statuses.push("disconnected"),
    onEvent: update => { state = reducer.runtimeReducer(state, reducer.applyRuntimeEvent(update)) },
  })
  await until(() => statuses.length === 1)
  const first = toolSequence(10, sessionId, assistantId, "first-session.txt", "first output")
  const second = toolSequence(100, secondSessionId, secondAssistantId, "second-session.txt", "second output")
  const socket = sockets[0]
  for (const source of [first[0], second[0], first[1], second[1], first[2], second[2],
    second[3], second[4], second[4], second[5], first[3], first[2], first[4], first[5]]) emit(socket, source)

  assert.deepEqual(statuses, ["connected"])
  assert.equal(sockets.length, 1)
  assert.equal(socket.readyState, FakeSocket.OPEN)
  assert.deepEqual(socket.closes, [])
  for (const [id, messageId, filename, output] of [
    [sessionId, assistantId, "first-session.txt", "first output"],
    [secondSessionId, secondAssistantId, "second-session.txt", "second output"],
  ]) {
    const session = state.sessions[id]
    assert.equal(session.status, "idle")
    assert.deepEqual(session.messageOrder, [messageId])
    assert.deepEqual(Object.keys(session.messages), [messageId])
    assert.deepEqual(session.messages[messageId].partOrder, ["call-1"])
    const tool = session.messages[messageId].parts["call-1"]
    assert.equal(tool.state.status, "completed")
    assert.deepEqual(tool.state.input, { path: filename })
    assert.equal(tool.state.output, output)
  }
})

test("a tool gap reconnects only its session while the other session keeps receiving results", async () => {
  const received = [], statuses = []
  unsubscribe = await transport.subscribeRpcEvents(value => received.push(value), value => statuses.push(value))
  await until(() => statuses.length === 1)
  sockets[0].receive({ method: "session.discovered", params: { sessionId, afterSeq: "9" } })
  sockets[0].receive({ method: "session.discovered", params: { sessionId: secondSessionId, afterSeq: "99" } })
  await until(() => sockets.length === 3 && sockets.every(socket => socket.requests.length))
  await delay(0)
  const first = sockets[1], second = sockets[2]
  const forSecondSession = seq => ({ ...event(seq, "operation.completed"), sessionId: secondSessionId })
  emit(first, assistant(10)); emit(second, forSecondSession(100))
  emit(first, event(12, "operation.started", { callId: "call-1", name: "read_file" }))
  emit(second, forSecondSession(101))
  assert.deepEqual(statuses, [true])
  assert.equal(first.readyState, 3); assert.equal(second.readyState, 1)
  assert.deepEqual(received.map(value => [value.sessionId, value.seq]), [[sessionId, "10"], [secondSessionId, "100"], [secondSessionId, "101"]])
  await until(() => sockets.length === 4 && sockets[3].requests.length)
  await delay(0)
  assert.equal(sockets[3].requests[0].params.afterSeq, "10")
  emit(sockets[3], event(11, "operation.started")); emit(sockets[3], event(12, "operation.completed"))
  emit(second, forSecondSession(102))
  assert.deepEqual(statuses, [true])
  assert.deepEqual(received.map(value => [value.sessionId, value.seq]), [
    [sessionId, "10"], [secondSessionId, "100"], [secondSessionId, "101"], [sessionId, "11"], [sessionId, "12"], [secondSessionId, "102"],
  ])
})
