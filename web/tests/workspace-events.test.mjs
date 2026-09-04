import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
const transport = await vite.ssrLoadModule("/src/lib/rpc-transport.ts")

after(async () => {
  await vite.close()
})

function event(eventType, payload) {
  return {
    id: `${eventType}-event`,
    sessionId: "session-1",
    turnId: null,
    seq: 1n,
    eventType,
    payload,
    createdAt: 2n,
  }
}

test("workspace lifecycle events survive the runtime event projection", () => {
  assert.deepEqual(
    transport.projectSessionEvent(event("workspace.changed", { path: "D:\\EDEN", name: "EDEN" })),
    [{ type: "workspace.changed", properties: { path: "D:\\EDEN", name: "EDEN" } }],
  )
  assert.deepEqual(
    transport.projectSessionEvent(event("workspace.switch_failed", { path: "D:\\missing", error: "not found" })),
    [{ type: "workspace.switch_failed", properties: { path: "D:\\missing", error: "not found" } }],
  )
})

test("tool catalog change events also reach their existing application handler", () => {
  assert.deepEqual(
    transport.projectSessionEvent(event("tools.changed", { source: "workspace" })),
    [{ type: "tools.changed", properties: { source: "workspace" } }],
  )
})
