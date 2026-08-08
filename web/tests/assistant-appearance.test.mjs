import assert from "node:assert/strict"
import test from "node:test"

import {
  costumeLayouts,
  resolveAssistantAppearance,
} from "../src/components/character/assistant-appearance.ts"

const standee = { id: 11, costume_key: "default", layout: "standee", enabled: true }
const lobby = { id: 12, costume_key: "summer", layout: "memory-lobby", enabled: true }
const assistant = {
  id: 1,
  name: "Test",
  is_default: true,
  is_assistant_mode: false,
  visual_costume_id: 2,
  visual_layout: "memory-lobby",
  character: {
    id: 1,
    name: "Test",
    visual_preference: "spine",
    default_costume_id: "default",
    spine_assets: [standee, lobby],
    costumes: [
      { id: 1, costume_id: "default", name: "原版", is_default: true, enabled: true, spine_assets: [standee] },
      { id: 2, costume_id: "summer", name: "夏日", is_default: false, enabled: true, spine_assets: [lobby] },
    ],
  },
}

test("resolves the assistant-owned costume and layout preference", () => {
  const appearance = resolveAssistantAppearance(assistant)
  assert.equal(appearance.costumeKey, "summer")
  assert.equal(appearance.layout, "memory-lobby")
  assert.equal(appearance.asset, lobby)
})

test("falls back inside the same costume when a requested layout is unavailable", () => {
  const appearance = resolveAssistantAppearance(assistant, { costumeId: 1, layout: "memory-lobby" })
  assert.equal(appearance.costumeKey, "default")
  assert.equal(appearance.layout, "standee")
  assert.equal(appearance.asset, standee)
})

test("reports only enabled layouts from a costume", () => {
  assert.deepEqual(costumeLayouts({
    ...assistant.character.costumes[0],
    spine_assets: [standee, { ...lobby, costume_key: "default", enabled: false }],
  }), ["standee"])
})
