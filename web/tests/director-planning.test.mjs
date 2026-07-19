import assert from "node:assert/strict"
import test from "node:test"

import { directorRunForLocalPrompt } from "../src/lib/companion-director-state.ts"

test("starts the director planning card in the same local turn for multiple assistants", () => {
  const run = directorRunForLocalPrompt(2, "msg-local")
  assert.equal(run?.status, "planning")
  assert.equal(run?.participantCount, 2)
  assert.equal(run?.userMessageID, "msg-local")
})

test("does not create director planning state for a single assistant", () => {
  assert.equal(directorRunForLocalPrompt(1), undefined)
})
