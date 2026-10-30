import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { createServer } from "vite"
import { fileURLToPath } from "node:url"

const transport = readFileSync(new URL("../src/lib/rpc-transport.ts", import.meta.url), "utf8")
const client = readFileSync(new URL("../src/lib/agent-client.ts", import.meta.url), "utf8")

test("Rust character action events are projected into the UI contract", () => {
  assert.match(transport, /event\.eventType === "character\.action\.changed"/)
  assert.match(transport, /characterID: value\.characterID \?\? value\.characterId/)
  assert.match(transport, /performanceID: value\.performanceID/)
  assert.match(transport, /effectAnchor: value\.effectAnchor/)
})

test("sticker events project identically in live delivery and reopened history, independent of an active shell", async t => {
  const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  t.after(() => vite.close())
  const { apiMessage, projectSessionEvent } = await vite.ssrLoadModule('/src/lib/rpc-transport.ts')
  const event = { id: 'sticker-event', sessionId: 'session', turnId: 'turn', seq: '1', createdAt: 1000,
    eventType: 'character.sticker.sent', payload: { actor: { assistantID: 2 },
      part: { stickerId: 7, characterId: 9, name: '表情', url: 'https://fixture.invalid/sticker.gif' } } }
  const history = apiMessage(event), updates = projectSessionEvent(event, 'transient-shell')
  assert.equal(history.info.id, event.id); assert.equal(history.info.speaker.assistantID, 2)
  assert.deepEqual(updates[0].properties.info, history.info)
  assert.deepEqual(updates[1].properties.part, history.parts[0])
  assert.equal(history.parts[0].messageID, event.id)
})
