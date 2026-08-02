import assert from "node:assert/strict"
import test from "node:test"

import { removeSessionState } from "../src/lib/session-delete-state.ts"

function state(ids, activeSessionId) {
  return {
    sessions: Object.fromEntries(ids.map((id) => [id, { id }])),
    sessionOrder: ids,
    permissions: {},
    permissionOrder: [],
    questions: {},
    questionOrder: [],
    activeSessionId,
  }
}

test("removing the active session selects the next persisted session", () => {
  const value = state(["first", "second"], "first")
  removeSessionState(value, "first")

  assert.equal(value.sessions.first, undefined)
  assert.deepEqual(value.sessionOrder, ["second"])
  assert.equal(value.activeSessionId, "second")
})

test("removing the last session returns to an unpersisted draft", () => {
  const value = state(["only"], "only")
  removeSessionState(value, "only")

  assert.deepEqual(value.sessionOrder, [])
  assert.equal(value.activeSessionId, undefined)
})
