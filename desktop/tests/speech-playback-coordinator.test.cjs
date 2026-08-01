const test = require("node:test")
const assert = require("node:assert/strict")
const { SpeechPlaybackCoordinator } = require("../src/speech-playback-coordinator.cjs")

test("automatic playback is granted only to the preferred visible surface", () => {
  const coordinator = new SpeechPlaybackCoordinator()

  const main = coordinator.claim({
    ownerId: 1,
    surface: "main-chat",
    segmentId: "segment-1",
    intent: "auto",
    preferredAutoSurface: "pet-bubble",
  })
  const bubble = coordinator.claim({
    ownerId: 2,
    surface: "pet-bubble",
    segmentId: "segment-1",
    intent: "auto",
    preferredAutoSurface: "pet-bubble",
  })

  assert.deepEqual(main, { granted: false, reason: "not-preferred-surface" })
  assert.equal(bubble.granted, true)
  assert.equal(coordinator.snapshot().ownerId, 2)
})

test("manual playback preempts the previous renderer and stale release cannot clear it", () => {
  const stops = []
  const coordinator = new SpeechPlaybackCoordinator((ownerId, control) => stops.push({ ownerId, control }))
  const bubble = coordinator.claim({
    ownerId: 2,
    surface: "pet-bubble",
    segmentId: "segment-1",
    intent: "auto",
    preferredAutoSurface: "pet-bubble",
  })
  const main = coordinator.claim({
    ownerId: 1,
    surface: "main-chat",
    segmentId: "segment-2",
    intent: "manual",
    preferredAutoSurface: "pet-bubble",
  })

  assert.equal(main.granted, true)
  assert.equal(stops.length, 1)
  assert.equal(stops[0].ownerId, 2)
  assert.equal(stops[0].control.leaseId, bubble.leaseId)
  assert.equal(coordinator.release(2, bubble.leaseId), false)
  assert.equal(coordinator.snapshot().leaseId, main.leaseId)
})

test("revoking a destroyed owner stops and clears its playback lease", () => {
  const stops = []
  const coordinator = new SpeechPlaybackCoordinator((ownerId, control) => stops.push({ ownerId, control }))
  coordinator.claim({ ownerId: 7, surface: "pet-bubble", segmentId: "segment-1" })

  assert.equal(coordinator.revokeOwner(7, "window-closed"), true)
  assert.equal(coordinator.snapshot(), null)
  assert.equal(stops[0].control.reason, "window-closed")
})
