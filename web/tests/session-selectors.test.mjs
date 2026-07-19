import assert from "node:assert/strict"
import test from "node:test"

import {
  isAssistantMessageStreaming,
  isRuntimeSessionRunning,
  runtimePartState,
} from "../src/lib/session-stream-state.ts"

test("an interrupted assistant message is not shown as streaming after the session is idle", () => {
  const running = isRuntimeSessionRunning("idle")

  assert.equal(isAssistantMessageStreaming(running, true, true), false)
  assert.equal(runtimePartState(running, true), "done")
})

test("an unfinished assistant message remains streaming while the session is busy", () => {
  const running = isRuntimeSessionRunning("busy")

  assert.equal(isAssistantMessageStreaming(running, true, true), true)
  assert.equal(runtimePartState(running, true), "streaming")
})
