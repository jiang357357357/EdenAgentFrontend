import assert from "node:assert/strict"
import test from "node:test"

import { upsertSubagentThread } from "../src/lib/subagent-state.ts"

test("upserts subagent lifecycle state without creating chat data", () => {
  const running = {
    id: "agt-1",
    rootSessionID: "session-1",
    agentPath: "/root/research",
    taskName: "research",
    role: "researcher",
    status: "running",
    depth: 1,
    createdAt: 2,
    updatedAt: 3,
  }
  let threads = upsertSubagentThread([], running)
  assert.equal(threads.length, 1)
  assert.equal(threads[0].status, "running")

  threads = upsertSubagentThread(threads, {
    ...running,
    status: "completed",
    result: { content: "done", summary: "done" },
    updatedAt: 4,
  })

  assert.equal(threads.length, 1)
  assert.equal(threads[0].status, "completed")
  assert.equal(threads[0].result.summary, "done")
})
