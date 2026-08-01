import assert from "node:assert/strict"
import test from "node:test"

import { normalizePetDialogSegments, petDialogValueText } from "../src/lib/pet-dialog-segments.ts"

test("normalizes non-string message fields before React renders them", () => {
  const [segment] = normalizePetDialogSegments([{
    speaker: 42,
    text: { answer: "ok" },
    runtimeTrace: ["step one", "step two"],
  }])

  assert.equal(segment.speaker, "42")
  assert.equal(segment.text, '{\n  "answer": "ok"\n}')
  assert.equal(segment.runtimeTrace, '[\n  "step one",\n  "step two"\n]')
})

test("normalizes arbitrary tool results and status", () => {
  const [segment] = normalizePetDialogSegments([{
    tool: {
      id: 7,
      name: "read",
      status: "completed",
      input: { path: "README.md" },
      output: { lines: ["hello"] },
    },
  }])

  assert.deepEqual(segment.tool, {
    id: "7",
    name: "read",
    status: "running",
    input: '{\n  "path": "README.md"\n}',
    output: '{\n  "lines": [\n    "hello"\n  ]\n}',
    error: undefined,
    duration: undefined,
  })
})

test("handles circular values without throwing", () => {
  const value = {}
  value.self = value
  assert.equal(petDialogValueText(value), "[object Object]")
})
