import assert from "node:assert/strict"
import test from "node:test"

import {
  pickSpineInteractionPair,
  pickSpineReaction,
  randomSpineDelayMs,
  resolveSpineBlinkPlayback,
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

test("resolves Kei held gestures, talk layers, and scheduled idles", () => {
  const interactions = resolveSpineInteractionAnimations([
    "Idle_01",
    "Idle_01_R",
    "Eye_Close_01",
    "Look_01_M",
    "Look_02_M",
    "LookEnd_01_M",
    "LookEnd_01_A",
    "Pat_01_M",
    "Pat_02_M",
    "PatEnd_01_M",
    "PatEnd_01_A",
    "Pinch_01_M",
    "Pinch_02_M",
    "PinchEnd_01_M",
    "PinchEnd_01_A",
    "Talk_01_M",
    "Talk_01_A",
    "Talk_02_M",
    "Talk_02_A",
  ])

  assert.equal(interactions.lookHoldMain, "Look_02_M")
  assert.equal(interactions.patHoldMain, "Pat_02_M")
  assert.equal(interactions.pinchMain, "Pinch_01_M")
  assert.equal(interactions.pinchHoldMain, "Pinch_02_M")
  assert.equal(interactions.pinchEndMain, "PinchEnd_01_M")
  assert.equal(interactions.blink, "Eye_Close_01")
  assert.equal(interactions.rareIdle, "Idle_01_R")
  assert.deepEqual(interactions.talks, [
    { main: "Talk_01_M", aux: "Talk_01_A" },
    { main: "Talk_02_M", aux: "Talk_02_A" },
  ])
})

test("resolves common standalone blink animation names", () => {
  assert.equal(resolveSpineInteractionAnimations(["Idle", "Blink"]).blink, "Blink")
  assert.equal(resolveSpineInteractionAnimations(["Idle", "EyeClose_02"]).blink, "EyeClose_02")
})

test("short blink clips receive a natural minimum duration and smooth mix out", () => {
  assert.deepEqual(resolveSpineBlinkPlayback(0.08), { timeScale: 0.08 / 0.6, mixOutSeconds: 0.2 })
  assert.deepEqual(resolveSpineBlinkPlayback(0.24), { timeScale: 0.24 / 0.6, mixOutSeconds: 0.2 })
  assert.deepEqual(resolveSpineBlinkPlayback(0.64), { timeScale: 1, mixOutSeconds: 0.2 })
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

test("does not immediately repeat a layered talk", () => {
  const talks = [
    { main: "Talk_01_M", aux: "Talk_01_A" },
    { main: "Talk_02_M", aux: "Talk_02_A" },
    { main: "Talk_03_M", aux: "Talk_03_A" },
  ]
  assert.equal(pickSpineInteractionPair(talks, "Talk_02_M", () => 0)?.main, "Talk_01_M")
  assert.equal(pickSpineInteractionPair(talks, "Talk_02_M", () => 0.99)?.main, "Talk_03_M")
})

test("uses the official Kei random timing windows", () => {
  assert.equal(randomSpineDelayMs(12, 15, () => 0), 12_000)
  assert.ok(Math.abs(randomSpineDelayMs(12, 15, () => 0.999999) - 14_999.997) < 0.000_001)
  assert.equal(randomSpineDelayMs(80, 70, () => 0), 70_000)
})

test("releases looping performance tracks when they should reset to idle", () => {
  assert.equal(shouldLoopSpineAction({ loop: true, track: 0, reset_to_idle: true }), true)
  assert.equal(shouldLoopSpineAction({ loop: true, track: 1, reset_to_idle: true }), false)
  assert.equal(shouldLoopSpineAction({ loop: true, track: 1, reset_to_idle: false }), true)
  assert.equal(shouldLoopSpineAction({ loop: false, track: 1, reset_to_idle: false }), false)
})
