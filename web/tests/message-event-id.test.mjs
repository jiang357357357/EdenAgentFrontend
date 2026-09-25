import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" })
const transport = await vite.ssrLoadModule("/src/lib/rpc-transport.ts")

const { createSessionEventProjector, projectMessageEvents } = await vite.ssrLoadModule('/src/lib/agent-client.ts')
const { runtimeReducer, initialRuntimeState, applyRuntimeEvent, hydrateSessionMessages } = await vite.ssrLoadModule('/src/lib/session-reducer.ts')

after(async () => {
  await vite.close()
})

test("uses the stable payload message id for a message_end event", () => {
  const event = {
    id: "end-event-id",
    sessionId: "session-1",
    seq: 2n,
    turnId: "turn-1",
    eventType: "agent.message_end",
    createdAt: 2_000n,
    payload: {
      messageId: "start-event-id",
      message: {
        role: "user",
        timestamp: 1_000,
        content: [{ type: "text", text: "你好" }],
      },
    },
  }

  assert.equal(transport.sessionEventMessageID(event), "start-event-id")
  assert.equal(transport.apiMessage(event)?.info.id, "start-event-id")
})

test("falls back to the event id when a start event has no payload message id", () => {
  const event = {
    id: "start-event-id",
    sessionId: "session-1",
    seq: 1n,
    turnId: "turn-1",
    eventType: "agent.message_start",
    createdAt: 1_000n,
    payload: {
      message: {
        role: "user",
        timestamp: 1_000,
        content: [{ type: "text", text: "你好" }],
      },
    },
  }

  assert.equal(transport.sessionEventMessageID(event), "start-event-id")
  assert.equal(transport.apiMessage(event)?.info.id, "start-event-id")
})

test('live and hydrated messages share durable identity without merging repeated user turns', () => {
  const base = { sessionId: 's', turnId: 't', seq: 1, createdAt: 1000,
    payload: { messageId: 'durable-user', message: { role: 'user', timestamp: 1000, content: [{ type: 'text', text: '你好' }] } } }
  const start = { ...base, id: 'start-event', eventType: 'agent.message_start' }
  const end = { ...base, id: 'end-event', eventType: 'agent.message_end', seq: 2 }
  const project = createSessionEventProjector()
  let state = initialRuntimeState
  for (const update of project(start)) state = runtimeReducer(state, applyRuntimeEvent(update))
  state = runtimeReducer(state, hydrateSessionMessages('s', { items: projectMessageEvents([end]), hasMore: false }))
  for (const update of project(end)) state = runtimeReducer(state, applyRuntimeEvent(update))
  assert.deepEqual(state.sessions.s.messageOrder, ['durable-user'])
  assert.equal(projectMessageEvents([start, end]).length, 1)
  const second = { ...end, id: 'next-event', turnId: 't2', payload: { ...base.payload, messageId: 'second-user' } }
  assert.equal(projectMessageEvents([end, second]).length, 2)
})
