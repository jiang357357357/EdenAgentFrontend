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

test("hands rapid user turns to the server in submission order", () => {
  const messages = {
    first: { id: "first", role: "user", createdAt: 10_000, localOnly: true, deliveryState: "queued" },
    second: { id: "second", role: "user", createdAt: 10_010, localOnly: true, deliveryState: "sending" },
  }

  assert.equal(
    findOptimisticUserHandoff(["first", "second"], messages, 10_020)?.id,
    "first",
  )
})

test("does not hand a failed local turn to a later server message", () => {
  const messages = {
    failed: { id: "failed", role: "user", createdAt: 10_000, localOnly: true, deliveryState: "failed" },
    pending: { id: "pending", role: "user", createdAt: 10_010, localOnly: true, deliveryState: "queued" },
  }

  assert.equal(
    findOptimisticUserHandoff(["failed", "pending"], messages, 10_020)?.id,
    "pending",
  )
})

test("uses the accepted backend turn id instead of timestamp guessing", () => {
  const messages = {
    first: { id: "first", role: "user", turnID: "turn-1", createdAt: 10_000, localOnly: true, deliveryState: "queued" },
    second: { id: "second", role: "user", turnID: "turn-2", createdAt: 20_000, localOnly: true, deliveryState: "queued" },
  }

  assert.equal(
    findOptimisticUserHandoff(["first", "second"], messages, 100_000, "turn-2")?.id,
    "second",
  )
})
