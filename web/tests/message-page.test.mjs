import assert from "node:assert/strict"
import test from "node:test"

import { parseMessagePage } from "../src/lib/message-page.ts"

test("rejects the legacy bare message array", () => {
  const messages = [{ info: { id: "message-1" }, parts: [] }]
  assert.throws(() => parseMessagePage(messages), /items must be an array/)
})

test("preserves the paginated message response", () => {
  const messages = [{ info: { id: "message-2" }, parts: [] }]
  assert.deepEqual(parseMessagePage({ items: messages, hasMore: true, nextCursor: "message-2" }), {
    items: messages,
    hasMore: true,
    nextCursor: "message-2",
  })
})

test("rejects malformed paginated responses", () => {
  assert.throws(() => parseMessagePage({ items: null, hasMore: "yes" }), /items must be an array/)
  assert.throws(() => parseMessagePage({ items: [], hasMore: false }), /nextCursor must be a string or null/)
  assert.throws(() => parseMessagePage({ items: [], hasMore: true, nextCursor: null }), /nextCursor is required/)
})
