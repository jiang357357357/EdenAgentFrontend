import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const transport = readFileSync(new URL("../src/lib/rpc-transport.ts", import.meta.url), "utf8")
const client = readFileSync(new URL("../src/lib/agent-client.ts", import.meta.url), "utf8")

test("Rust character action events are projected into the UI contract", () => {
  assert.match(transport, /event\.eventType === "character\.action\.changed"/)
  assert.match(transport, /characterID: value\.characterID \?\? value\.characterId/)
  assert.match(transport, /performanceID: value\.performanceID/)
  assert.match(transport, /effectAnchor: value\.effectAnchor/)
})

test("Rust sticker events become structured assistant message parts", () => {
  assert.match(transport, /event\.eventType === "character\.sticker\.sent"/)
  assert.match(transport, /type: "message\.part\.updated"/)
  assert.match(transport, /type: "sticker"/)
  assert.match(transport, /stickerID,/)
  assert.match(transport, /characterID,/)
  assert.match(client, /event\.eventType !== "character\.sticker\.sent"/)
  assert.match(client, /applyProjectedParts\(event, latest\)/)
  assert.match(client, /event\.eventType === "turn\.completed"/)
})
