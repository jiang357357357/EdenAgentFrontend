import assert from "node:assert/strict"
import test from "node:test"

import {
  pickSpineReaction,
  resolveSpineInteractionAnimations,
  shouldLoopSpineAction,
  spineInteractionZone,
} from "../src/lib/spine-interactions.ts"

test("resolves Arona layered look and pat animations", () => {
  const interactions = resolveSpineInteractionAnimations([
    "Idle_01",
    "Look_01_A",
    "Look_01_M",
    "LookEnd_01_A",
    "LookEnd_01_M",
    "Pat_01_A",
    "Pat_01_M",
    "PatEnd_01_A",
    "PatEnd_01_M",
    "03",
    "12",
  ])

  assert.equal(interactions.lookMain, "Look_01_M")
  assert.equal(interactions.lookAux, "Look_01_A")
  assert.equal(interactions.patMain, "Pat_01_M")
  assert.equal(interactions.patAux, "Pat_01_A")
  assert.deepEqual(interactions.reactions, ["03", "12"])
})

test("separates head and body interaction zones", () => {
  assert.equal(spineInteractionZone(0.2), "head")
  assert.equal(spineInteractionZone(0.4), "head")
  assert.equal(spineInteractionZone(0.41), "body")
})

test("does not immediately repeat a random body reaction", () => {
  assert.equal(pickSpineReaction(["03", "12", "31"], "12", () => 0), "03")
  assert.equal(pickSpineReaction(["03", "12", "31"], "12", () => 0.99), "31")
})

test("releases looping performance tracks when they should reset to idle", () => {
  assert.equal(shouldLoopSpineAction({ loop: true, track: 0, reset_to_idle: true }), true)
  assert.equal(shouldLoopSpineAction({ loop: true, track: 1, reset_to_idle: true }), false)
  assert.equal(shouldLoopSpineAction({ loop: true, track: 1, reset_to_idle: false }), true)
  assert.equal(shouldLoopSpineAction({ loop: false, track: 1, reset_to_idle: false }), false)
})
