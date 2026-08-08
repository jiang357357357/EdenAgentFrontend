import assert from "node:assert/strict"
import test from "node:test"

import { actionMapping } from "../src/components/character/renderer/spine/spine-action-mapping.ts"

test("uses the action mapping that belongs to the selected Spine layout", () => {
  const activeAction = {
    action: {
      spine: { animation: "33", track: 1 },
      spine_variants: {
        default: {
          standee: { animation: "33", track: 1 },
          "memory-lobby": {
            animation: "Talk_01_M",
            track: 1,
            sync: [{ animation: "Talk_01_A", track: 2, loop: false }],
          },
        },
      },
    },
  }

  assert.equal(actionMapping(activeAction, "standee")?.animation, "33")
  assert.equal(actionMapping(activeAction, "memory-lobby")?.animation, "Talk_01_M")
  assert.equal(actionMapping(activeAction, "memory-lobby")?.sync?.[0]?.animation, "Talk_01_A")
})

test("uses the action mapping for the selected costume before layout", () => {
  const activeAction = {
    action: {
      spine_variants: {
        default: { standee: { animation: "Idle_Default" } },
        summer: { standee: { animation: "Idle_Summer" } },
      },
    },
  }
  assert.equal(actionMapping(activeAction, "standee", "summer")?.animation, "Idle_Summer")
})

test("keeps the legacy mapping for older servers", () => {
  const activeAction = { action: { spine: { animation: "Idle_01", track: 0, loop: true } } }
  assert.equal(actionMapping(activeAction, "standee")?.animation, "Idle_01")
})
