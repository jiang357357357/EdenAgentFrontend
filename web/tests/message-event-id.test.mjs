import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
const transport = await vite.ssrLoadModule("/src/lib/rpc-transport.ts")

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
