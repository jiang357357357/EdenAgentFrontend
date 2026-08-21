import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { after, test } from "node:test"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
const runtimeTransport = await vite.ssrLoadModule("/src/lib/rpc-transport.ts")
const reducer = await vite.ssrLoadModule("/src/lib/session-reducer.ts")

after(async () => {
  await vite.close()
})

const transport = readFileSync(new URL("../src/lib/rpc-transport.ts", import.meta.url), "utf8")
const host = readFileSync(new URL("../../../Server/crates/mon-agent-host/src/core_tools.rs", import.meta.url), "utf8")
const appRuntime = readFileSync(new URL("../../../Server/crates/mon-agent-app/src/runtime/mod.rs", import.meta.url), "utf8")
const appMessage = readFileSync(new URL("../../../Server/crates/mon-agent-app/src/runtime/message.rs", import.meta.url), "utf8")
const server = readFileSync(new URL("../../../Server/rust/main.rs", import.meta.url), "utf8")
const store = readFileSync(new URL("../../../Server/crates/mon-agent-store/src/lib.rs", import.meta.url), "utf8")

test("assistant switching is a durable next-root-run handoff", () => {
  assert.match(host, /schedule_assistant_handoff/)
  assert.match(store, /session\.assistant_handoff\.requested/)
  assert.match(server, /dispatch_assistant_handoff/)
  assert.match(server, /ensure_assistant_handoff_ready/)
  assert.match(server, /configure_assistant_for_session/)
  assert.match(server, /commit_assistant_handoff/)
  assert.match(store, /session\.assistant_handoff\.completed/)
  assert.match(store, /state = 'completed'/)
})

test("the internal handoff instruction is hidden and transient", () => {
  assert.match(appRuntime, /"internalHandoff": job_kind == "assistant\.handoff"/)
  assert.match(appMessage, /extra\.insert\("transient"\.to_owned\(\), Value::Bool\(true\)\)/)
  assert.match(transport, /message\?\.display === false \|\| message\?\.internalHandoff === true/)
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
