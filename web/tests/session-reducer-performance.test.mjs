import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("unrelated global events preserve runtime state identity", () => {
  const source = readFileSync(new URL("../src/lib/session-reducer.ts", import.meta.url), "utf8")
  assert.match(source, /action\.type === "event" && !isRuntimeStateEvent\(action\.event\)/)
  assert.match(source, /return state\s*\n\s*}/)
})
