import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" })
const client = await vite.ssrLoadModule("/src/lib/agent-client.ts")
const reducer = await vite.ssrLoadModule("/src/lib/session-reducer.ts")
const selectors = await vite.ssrLoadModule("/src/lib/session-selectors.ts")
after(() => vite.close())

function fixture(sessionIDs = ["session-1"]) {
  const project = client.createSessionEventProjector()
  let sequence = 0
  let state = reducer.runtimeReducer(reducer.initialRuntimeState, reducer.hydrateSessionList(sessionIDs.map(id => ({
    id, title: "Reply timing", time: { created: 1, updated: 1 },
  }))))
  const source = (eventType, createdAt, payload = {}, turnId = "turn-1", sessionId = "session-1") => ({
    id: `event-${++sequence}`, seq: BigInt(sequence), eventType, createdAt, payload, turnId, sessionId,
  })
  const emit = (...args) => {
    for (const event of project(source(...args))) state = reducer.runtimeReducer(state, reducer.applyRuntimeEvent(event))
  }
  const reply = (id, at, { turnId = "turn-1", sessionId = "session-1", message = {}, ...payload } = {}) => {
    const body = { messageId: id, message: { role: "assistant", timestamp: at - 1,
      model: "fixture-model", provider: "fixture-provider", content: [{ type: "text", text: id }], ...message }, ...payload }
    emit("agent.message_start", at - 1, body, turnId, sessionId)
    emit("agent.message_end", at, body, turnId, sessionId)
  }
  const historyReply = (id, at, turnTiming, turnId = "turn-1", sessionId = "session-1", message = {}) => source("agent.message_end", at, {
    messageId: id, message: { role: "assistant", timestamp: at - 1, content: [{ type: "text", text: id }], ...message },
    ...(turnTiming === undefined ? {} : { turnTiming }),
  }, turnId, sessionId)
  const hydrate = (events, { prepend = false, sessionId = "session-1", hasMore = false } = {}) => {
    const page = { items: client.projectMessageEvents(events), hasMore, nextCursor: hasMore ? events[0].id : null }
    state = reducer.runtimeReducer(state, prepend
      ? reducer.prependSessionMessages(sessionId, page)
      : reducer.hydrateSessionMessages(sessionId, page))
  }
  const messages = (sessionId = "session-1") => selectors.selectSessions(state).find(session => session.id === sessionId).messages
  const durations = (sessionId = "session-1") => messages(sessionId)
    .filter(message => message.replyDurationMs !== undefined).map(message => [message.id, message.replyDurationMs])
  return { source, emit, reply, historyReply, hydrate, messages, durations, state: () => state }
}

test("one completed turn shows its full tool and multi-speaker duration only below the final assistant", () => {
  const f = fixture()
  f.emit("turn.started", 1_000)
  f.reply("tool-phase", 2_000, { message: { speaker: { assistantID: "alice", assistantName: "Alice" }, content: [
    { type: "text", text: "Checking" }, { type: "toolCall", id: "tool-1", name: "exec_command", arguments: { command: "fixture" } },
  ] } })
  f.emit("agent.message_end", 6_000, { message: { role: "toolResult", toolCallId: "tool-1", toolName: "exec_command",
    timestamp: 6_000, content: [{ type: "text", text: "Done" }], isError: false } })
  f.reply("alice-final", 7_000, { message: { speaker: { assistantID: "alice", assistantName: "Alice" } } })
  f.reply("bob-final", 9_000, { message: { speaker: { assistantID: "bob", assistantName: "Bob" } } })
  assert.deepEqual(f.durations(), [], "Finishing a message or a speaker is not completing the whole turn")
  f.emit("turn.completed", 10_000)
  assert.deepEqual(f.durations(), [["bob-final", 9_000]])
  assert.equal(f.messages().find(message => message.id === "tool-phase").toolCalls[0].status, "success")
})

test("queue waiting is excluded and no duration appears before turn completion", () => {
  const f = fixture()
  f.emit("input.queued", 1_000, { inputId: "input-1", text: "Queued request" })
  f.emit("turn.started", 7_000)
  f.reply("reply", 8_000)
  assert.deepEqual(f.durations(), [])
  f.emit("turn.completed", 10_000)
  assert.deepEqual(f.durations(), [["reply", 3_000]])
})

test("opening a running turn before its first reply can recover the start from completion", () => {
  const f = fixture()
  f.reply("answer-after-opening", 8_000)
  assert.deepEqual(f.durations(), [])
  f.emit("turn.completed", 9_000, { turnTiming: { startedAt: 1_000 } })
  assert.deepEqual(f.durations(), [["answer-after-opening", 8_000]])
})

test("cancelled and failed turns never publish a successful reply duration", () => {
  for (const failure of ["input.interrupted", "turn.failed"]) {
    const f = fixture()
    f.emit("turn.started", 1_000)
    f.reply("partial-reply", 2_000)
    f.emit(failure, 5_000, { reason: "Fixture interruption" })
    assert.deepEqual(f.durations(), [], failure)
  }
})

test("model retries retain the original turn start instead of restarting the reply clock", () => {
  const f = fixture()
  f.emit("turn.started", 1_000)
  f.reply("failed-attempt", 2_000, { message: { errorMessage: "temporary model failure" } })
  f.emit("agent.retry_scheduled", 3_000, { operation: "model", attempt: 1, maxAttempts: 3, delayMs: 2_000 })
  f.emit("agent.retry_attempt_start", 5_000, { operation: "model" })
  f.reply("retried-answer", 7_000)
  f.emit("agent.retry_finished", 7_100, { operation: "model" })
  assert.deepEqual(f.durations(), [])
  f.emit("turn.completed", 8_000)
  assert.deepEqual(f.durations(), [["retried-answer", 7_000]])
  assert.ok(f.messages().every(message => message.id !== "failed-attempt"))
})

test("historical timing survives hydration and prepending earlier phases does not duplicate it", () => {
  const f = fixture(), timing = { startedAt: 1_000, completedAt: 9_000 }
  f.hydrate([f.historyReply("final", 8_000, timing)], { hasMore: true })
  assert.deepEqual(f.durations(), [["final", 8_000]])
  f.hydrate([
    f.historyReply("older-final", 300, { startedAt: 100, completedAt: 500 }, "older-turn"),
    f.historyReply("first-phase", 2_000, timing),
    f.historyReply("second-phase", 4_000, timing),
  ], { prepend: true })
  assert.deepEqual(f.durations(), [["older-final", 400], ["final", 8_000]])
})

test("an active historical phase supplies the start when a new live reply finishes after reconnect", () => {
  const f = fixture()
  f.hydrate([f.historyReply("before-reconnect", 2_000, { startedAt: 1_000 })])
  f.reply("after-reconnect", 7_000)
  f.emit("turn.completed", 8_000)
  assert.deepEqual(f.durations(), [["after-reconnect", 7_000]])
})

test("completion received before history hydration can pair with the historical start", () => {
  const f = fixture()
  f.emit("turn.completed", 8_000)
  f.hydrate([f.historyReply("reply", 7_000, { startedAt: 1_000 })])
  assert.deepEqual(f.durations(), [["reply", 7_000]])
})

test("a new busy turn preserves the previous reply duration", () => {
  const f = fixture()
  f.emit("turn.started", 1_000)
  f.reply("first-final", 3_000)
  f.emit("turn.completed", 4_000)
  f.emit("turn.started", 5_000, {}, "turn-2")
  f.reply("second-in-progress", 6_000, { turnId: "turn-2" })
  assert.equal(f.state().sessions["session-1"].status, "busy")
  assert.deepEqual(f.durations(), [["first-final", 3_000]])
  f.emit("turn.completed", 7_000, {}, "turn-2")
  assert.deepEqual(f.durations(), [["first-final", 3_000], ["second-in-progress", 2_000]])
})

test("missing, invalid and backwards timestamps never manufacture a duration", () => {
  for (const [start, end] of [[undefined, 5_000], [-1, 5_000], [100.5, 5_000], [1_000, NaN], [5_000, 1_000]]) {
    const f = fixture()
    if (start !== undefined) f.emit("turn.started", start)
    f.reply("reply", 3_000)
    f.emit("turn.completed", end)
    assert.deepEqual(f.durations(), [], `${start} -> ${end}`)
  }
  const f = fixture()
  f.hydrate([f.historyReply("malformed-history", 3_000, { startedAt: "1000", completedAt: 5_000 })])
  assert.deepEqual(f.durations(), [])
})

test("timings stay within their session even when turn identifiers are the same", () => {
  const f = fixture(["session-1", "session-2"])
  f.emit("turn.started", 1_000)
  f.reply("first-session", 3_000)
  f.emit("turn.started", 10_000, {}, "turn-1", "session-2")
  f.reply("second-session", 13_000, { sessionId: "session-2" })
  f.emit("turn.completed", 5_000)
  assert.deepEqual(f.durations("session-1"), [["first-session", 4_000]])
  assert.deepEqual(f.durations("session-2"), [])
  f.emit("turn.completed", 16_000, {}, "turn-1", "session-2")
  assert.deepEqual(f.durations("session-2"), [["second-session", 6_000]])
})
