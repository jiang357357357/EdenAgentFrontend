import assert from "node:assert/strict"
import test from "node:test"

import { findOptimisticUserHandoff } from "../src/lib/message-identity.ts"

test("finds the pending local user turn that a server message should take over", () => {
  const messages = {
    history: { id: "history", role: "user", createdAt: 1 },
    pending: { id: "pending", role: "user", createdAt: 10_000, localOnly: true },
  }

  assert.equal(
    findOptimisticUserHandoff(["history", "pending"], messages, 10_020)?.id,
    "pending",
  )
  assert.equal(findOptimisticUserHandoff(["history", "pending"], messages, 100_000), undefined)
})
