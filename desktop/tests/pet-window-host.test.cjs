const assert = require("node:assert/strict")
const test = require("node:test")

const {
  calculatePetWindowHostLayout,
  sameCharacterViewport,
  usesPetWorkAreaHost,
} = require("../src/pet/pet-window-host.cjs")

test("Linux uses one stable work-area host while the character moves logically", () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1000 }
  const first = calculatePetWindowHostLayout(
    { x: 133, y: 484, width: 645, height: 840 },
    workArea,
    "linux",
  )
  const second = calculatePetWindowHostLayout(
    { x: 133, y: 520, width: 645, height: 840 },
    workArea,
    "linux",
  )

  assert.deepEqual(first.hostBounds, workArea)
  assert.deepEqual(second.hostBounds, workArea)
  assert.deepEqual(first.characterViewport, {
    mode: "work-area",
    x: 133,
    y: 484,
    width: 645,
    height: 840,
  })
  assert.deepEqual(first.shape, [{ x: 133, y: 484, width: 645, height: 516 }])
})

test("Linux shape and viewport preserve partially off-screen coordinates", () => {
  const result = calculatePetWindowHostLayout(
    { x: -300, y: -120, width: 645, height: 840 },
    { x: 0, y: 0, width: 1920, height: 1000 },
    "linux",
  )

  assert.deepEqual(result.characterViewport, {
    mode: "work-area",
    x: -300,
    y: -120,
    width: 645,
    height: 840,
  })
  assert.deepEqual(result.shape, [{ x: 0, y: 0, width: 345, height: 720 }])
})

test("other platforms retain a character-sized native window", () => {
  const character = { x: 320, y: 180, width: 420, height: 700 }
  const result = calculatePetWindowHostLayout(
    character,
    { x: 0, y: 0, width: 1920, height: 1000 },
    "darwin",
  )

  assert.equal(usesPetWorkAreaHost("darwin"), false)
  assert.deepEqual(result.hostBounds, character)
  assert.deepEqual(result.characterViewport, {
    mode: "window",
    x: 0,
    y: 0,
    width: 420,
    height: 700,
  })
  assert.deepEqual(result.shape, [])
  assert.equal(sameCharacterViewport(result.characterViewport, { ...result.characterViewport }), true)
})
