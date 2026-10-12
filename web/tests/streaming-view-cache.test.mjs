import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"
import { createContextTokenEstimator, estimateConversationTokens } from "../src/lib/token-usage.ts"

const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" })
after(() => vite.close())
const { selectSessions, selectActiveSession } = await vite.ssrLoadModule("/src/lib/session-selectors.ts")
const { initialRuntimeState, runtimeReducer, applyRuntimeEvent } = await vite.ssrLoadModule("/src/lib/session-reducer.ts")

function fixture() {
  const message = (id, text, done) => ({ id, sessionID: "active", role: "assistant", createdAt: 1_000,
    completedAt: done ? 2_000 : undefined, partOrder: [id], parts: { [id]: { id, type: "text", text, done } } })
  const session = { id: "active", title: "测试", status: "busy", hydrated: true, hasMoreMessages: false,
    loadingOlderMessages: false, messageOrder: ["old", "live"],
    messages: { old: message("old", "已完成的历史", true), live: message("live", "当前", false) } }
  const other = { ...session, id: "other", messageOrder: [], messages: {} }
  return { ...initialRuntimeState, activeSessionId: "active", sessionOrder: ["active", "other"],
    sessions: { active: session, other } }
}

test("one stream delta reuses history views and the inactive session, across both selectors", () => {
  const state = fixture()
  const before = selectSessions(state)
  assert.equal(selectActiveSession(state), before[0])
  const next = runtimeReducer(state, applyRuntimeEvent({ type: "message.part.delta", properties: {
    sessionID: "active", messageID: "live", partID: "live", field: "text", delta: "回复" } }))
  const after = selectSessions(next)
  assert.equal(after[1], before[1])
  assert.equal(after[0].messages[0], before[0].messages[0])
  assert.notEqual(after[0].messages[1], before[0].messages[1])
  assert.equal(after[0].messages[1].content, "当前回复")
  assert.equal(before[0].messages[1].content, "当前")
  assert.equal(selectActiveSession(next), after[0])
})

test("status, timings, stream resets and history prepends invalidate the affected view", () => {
  let state = fixture()
  state.sessions.active.messages.live = { ...state.sessions.active.messages.live, turnID: "turn" }
  selectActiveSession(state)
  state = runtimeReducer(state, applyRuntimeEvent({ type: "session.status", properties: {
    sessionID: "active", status: { type: "idle" } } }))
  assert.equal(selectActiveSession(state).messages[1].isStreaming, false)
  state = { ...state, sessions: { ...state.sessions, active: { ...state.sessions.active,
    turnTimings: { turn: { startedAt: 1_000, completedAt: 9_000 } } } } }
  assert.equal(selectActiveSession(state).messages[1].replyDurationMs, 8_000)
  const active = state.sessions.active
  state = { ...state, sessions: { ...state.sessions, active: { ...active, messageOrder: ["prelude", ...active.messageOrder],
    messages: { ...active.messages, prelude: { ...active.messages.old, id: "prelude" } } } } }
  assert.equal(selectActiveSession(state).messages.length, 3)
  state = runtimeReducer(state, applyRuntimeEvent({ type: "message.stream_reset", properties: {
    sessionID: "active", messageID: "live", reason: "test-reset" } }))
  assert.equal(selectActiveSession(state).messages[2].speechEpoch, 1)
})

test("a new account snapshot with the same IDs never receives the old account view", () => {
  const first = fixture(), second = fixture()
  second.sessions.active.messages.live.parts.live.text = "其他账号"
  assert.notEqual(selectActiveSession(first), selectActiveSession(second))
  assert.equal(selectActiveSession(second).messages[1].content, "其他账号")
})

test("server token counts, including zero, do not scan history text", () => {
  const estimate = createContextTokenEstimator()
  const messages = [{ get content() { throw new Error("history should not be scanned") } }]
  assert.equal(estimate(messages, 0), 0)
  assert.equal(estimate(messages, 42_000), 42_000)
})

test("fallback scans only changed messages and preserves compaction, prepend and delete semantics", () => {
  const estimate = createContextTokenEstimator()
  let historyReads = 0
  const history = { get content() { historyReads += 1; return "历史文本" } }
  const live = { content: "当前" }
  assert.equal(estimate([history, live]), 6)
  const reads = historyReads
  assert.equal(estimate([history, { content: "当前回复" }]), 8)
  assert.equal(historyReads, reads)
  const compact = { segments: [{ type: "meta", part: { type: "compaction", contextTokensAfter: 120 } }] }
  const messages = [history, compact, live]
  assert.equal(estimate(messages), estimateConversationTokens(messages))
  assert.equal(estimate([live]), 2)
  assert.equal(estimate([{ content: "更早" }, live]), 4)
})
