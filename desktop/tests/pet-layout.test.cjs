const assert = require("node:assert/strict")
const test = require("node:test")

const { calculatePetWindowBounds, calculatePetWindowLayout, petCoordinate } = require("../src/pet/pet-layout.cjs")
const { DEFAULT_PET_SETTINGS } = require("../src/pet/pet-settings.cjs")

const workArea = { x: 100, y: 50, width: 1600, height: 900 }

test("pet coordinates reject missing values and round finite positions", () => {
  assert.equal(petCoordinate(null), null)
  assert.equal(petCoordinate(""), null)
  assert.equal(petCoordinate("12.6"), 13)
  assert.equal(petCoordinate("invalid"), null)
})

test("pet bounds honor dock placement and stored coordinates", () => {
  const left = calculatePetWindowBounds({ ...DEFAULT_PET_SETTINGS, dock: "left" }, workArea)
  const right = calculatePetWindowBounds({ ...DEFAULT_PET_SETTINGS, dock: "right" }, workArea)
  const stored = calculatePetWindowBounds({ ...DEFAULT_PET_SETTINGS, windowX: 321, windowY: 234 }, workArea)

  assert.equal(left.x, workArea.x + 16)
  assert.equal(right.x, workArea.x + workArea.width - right.width - 16)
  assert.deepEqual({ x: stored.x, y: stored.y }, { x: 321, y: 234 })
})

test("pet layout separates the character and interaction surfaces", () => {
  const layout = calculatePetWindowLayout(DEFAULT_PET_SETTINGS, workArea)

  assert.equal(layout.character.y, layout.group.y + layout.characterOffset)
  assert.equal(layout.character.height, layout.group.height - layout.characterOffset)
  assert.ok(layout.expandedBubble.height > 0)
  assert.ok(layout.collapsedBubble.width >= 32)
  assert.equal(layout.collapsedBubble.width, layout.collapsedBubble.height)
})

test("hidden input gives the whole group height to the character", () => {
  const layout = calculatePetWindowLayout({ ...DEFAULT_PET_SETTINGS, showInput: false }, workArea)
  assert.equal(layout.characterOffset, 0)
  assert.deepEqual(layout.character, layout.group)
  assert.equal(layout.expandedBubble.height, 1)
})
