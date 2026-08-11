import assert from "node:assert/strict"
import test from "node:test"
import { buildRunReview, buildRunReviewIndex, isLastMessageOfRun } from "../src/lib/run-review.ts"

function tool(id, name, files) {
  return { id, name, status: "success", input: "{}", details: { kind: "workspace_diff", files } }
}

test("aggregates ordered mutation details for one run", () => {
  const messages = [
    { id: "m1", role: "assistant", runID: "run-1", content: "", timestamp: "", toolCalls: [
      tool("t1", "edit", [{ path: "a.ts", additions: 2, deletions: 1, patch: "first" }]),
    ] },
    { id: "m2", role: "assistant", runID: "run-1", content: "", timestamp: "", segments: [
      { id: "s1", type: "tool", tool: tool("t2", "apply_patch", [
        { path: "a.ts", additions: 1, deletions: 1, patch: "second" },
        { path: "b.ts", additions: 4, deletions: 0, patch: "third" },
      ]) },
    ] },
  ]
  const review = buildRunReview(messages, "run-1")
  assert.equal(review.snapshot, false)
  assert.equal(review.files.length, 2)
  assert.equal(review.files[0].patches.length, 2)
  assert.equal(review.additions, 7)
  assert.equal(review.deletions, 2)
  assert.equal(isLastMessageOfRun(messages, 0), false)
  assert.equal(isLastMessageOfRun(messages, 1), true)
})

test("prefers the latest get_diff snapshot over intermediate mutations", () => {
  const messages = [{
    id: "m1", role: "assistant", runID: "run-1", content: "", timestamp: "", toolCalls: [
      tool("t1", "edit", [{ path: "a.ts", additions: 20, deletions: 10, patch: "intermediate" }]),
      tool("t2", "get_diff", [{ path: "a.ts", additions: 3, deletions: 1, patch: "final" }]),
    ],
  }]
  const review = buildRunReview(messages, "run-1")
  assert.equal(review.snapshot, true)
  assert.equal(review.additions, 3)
  assert.equal(review.deletions, 1)
  assert.equal(review.files[0].patches[0].patch, "final")
})

test("indexes multiple run reviews at their final visible message", () => {
  const messages = [
    { id: "a1", role: "assistant", runID: "run-a", content: "", timestamp: "", toolCalls: [
      tool("ta", "edit", [{ path: "a.ts", additions: 1, deletions: 0, patch: "a" }]),
    ] },
    { id: "b1", role: "assistant", runID: "run-b", content: "", timestamp: "", toolCalls: [
      tool("tb", "write", [{ path: "b.ts", additions: 2, deletions: 0, patch: "b" }]),
    ] },
    { id: "a2", role: "assistant", runID: "run-a", content: "done", timestamp: "" },
  ]

  const reviews = buildRunReviewIndex(messages)
  assert.deepEqual([...reviews.keys()], [2, 1])
  assert.equal(reviews.get(2).runID, "run-a")
  assert.equal(reviews.get(1).runID, "run-b")
  assert.equal(reviews.get(2).additions, 1)
  assert.equal(reviews.get(1).additions, 2)
})
