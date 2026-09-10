import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" })
const runtimeTransport = await vite.ssrLoadModule("/src/lib/rpc-transport.ts")
const reducer = await vite.ssrLoadModule("/src/lib/session-reducer.ts")

after(async () => {
  await vite.close()
})

// Durable scheduling and transient model context are exercised by Server/tests/handoff-*.test.ts.
test("internal handoff runtime events do not become public user messages", () => {
  const events = runtimeTransport.projectSessionEvent({ id: "internal", sessionId: "session-1", seq: 1n,
    eventType: "handoff.runtime.message_end", createdAt: 1n,
    payload: { message: { role: "user", content: [{ type: "text", text: "INTERNAL_INSTRUCTION" }] } },
  })
  assert.deepEqual(events, [])
})

test("handoff events replace the live conversation participant without rehydration", () => {
  let state = reducer.runtimeReducer(reducer.initialRuntimeState, reducer.hydrateSessionList([{
    id: "session-1",
    title: "handoff",
    participants: [{ assistantID: 4, assistantName: "Plana", position: 0 }],
    time: { created: 1, updated: 1 },
  }]))
  const event = (eventType, payload, seq) => ({
    id: `event-${seq}`,
    sessionId: "session-1",
    seq: BigInt(seq),
    eventType,
    payload,
    createdAt: BigInt(seq + 1),
  })
  const target = {
    assistantId: 3,
    assistantName: "Arona",
    characterId: 3,
    characterName: "阿罗娜",
    avatarUrl: "/arona.png",
    ttsConfigId: 7,
    position: 0,
  }

  for (const projected of runtimeTransport.projectSessionEvent(event(
    "session.assistant_handoff.requested",
    { jobId: "job-1", assistantId: 3, participant: target },
    1,
  ))) {
    state = reducer.runtimeReducer(state, reducer.applyRuntimeEvent(projected))
  }
  assert.equal(state.sessions["session-1"].assistantHandoff.status, "scheduled")
  assert.equal(state.sessions["session-1"].participants[0].assistantName, "Plana")

  for (const raw of [
    event("session.participants_updated", { participants: [target] }, 2),
    event("session.assistant_handoff.completed", {
      jobId: "job-1",
      assistantId: 3,
      participant: target,
    }, 3),
  ]) {
    for (const projected of runtimeTransport.projectSessionEvent(raw)) {
      state = reducer.runtimeReducer(state, reducer.applyRuntimeEvent(projected))
    }
  }

  const session = state.sessions["session-1"]
  assert.equal(session.assistantHandoff.status, "completed")
  assert.equal(session.participants.length, 1)
  assert.equal(session.participants[0].assistantID, 3)
  assert.equal(session.participants[0].assistantName, "Arona")
  assert.equal(session.participants[0].ttsConfigID, 7)
})

test("failed handoffs become visible session errors", () => {
  let state = reducer.runtimeReducer(reducer.initialRuntimeState, reducer.hydrateSessionList([{
    id: "session-1",
    title: "handoff",
    time: { created: 1, updated: 1 },
  }]))
  const events = runtimeTransport.projectSessionEvent({
    id: "event-failed",
    sessionId: "session-1",
    seq: 1n,
    eventType: "session.assistant_handoff.failed",
    payload: { jobId: "job-1", assistantId: 3, error: "model unavailable" },
    createdAt: 2n,
  })
  for (const event of events) {
    state = reducer.runtimeReducer(state, reducer.applyRuntimeEvent(event))
  }

  assert.equal(state.sessions["session-1"].assistantHandoff.status, "failed")
  assert.equal(state.sessions["session-1"].error, "model unavailable")
})
