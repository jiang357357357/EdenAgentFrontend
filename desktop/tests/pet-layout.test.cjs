const assert = require("node:assert/strict")
const test = require("node:test")

const {
  calculatePetWindowBounds,
  calculatePetWindowLayout,
  petCoordinate,
  snapPetIconToWorkArea,
} = require("../src/pet/pet-layout.cjs")
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
  const stored = calculatePetWindowBounds({ ...DEFAULT_PET_SETTINGS, windowX: 321, windowY: 180 }, workArea)

  assert.equal(left.x, workArea.x + 16)
  assert.equal(right.x, workArea.x + workArea.width - right.width - 16)
  assert.deepEqual({ x: stored.x, y: stored.y }, { x: 321, y: 180 })
})

test("pet layout separates the character and interaction surfaces", () => {
  const layout = calculatePetWindowLayout(DEFAULT_PET_SETTINGS, workArea)

  assert.equal(layout.character.y, layout.group.y + layout.characterOffset)
  assert.equal(layout.character.height, layout.group.height - layout.characterOffset)
  assert.ok(layout.expandedBubble.height > 0)
  assert.ok(layout.collapsedBubble.width >= 32)
  assert.equal(layout.collapsedBubble.width, layout.collapsedBubble.height)
  assert.equal(layout.collapsedBubble.x + 4, layout.group.x)
})

test("hidden input gives the whole group height to the character", () => {
  const layout = calculatePetWindowLayout({ ...DEFAULT_PET_SETTINGS, showInput: false }, workArea)
  assert.equal(layout.characterOffset, 0)
  assert.deepEqual(layout.character, layout.group)
  assert.equal(layout.expandedBubble.height, 1)
})

test("a 200% pet reaches full character height while retaining vertical movement", () => {
  const display = { x: 0, y: 0, width: 1920, height: 1040 }
  const layout = calculatePetWindowLayout({
    ...DEFAULT_PET_SETTINGS,
    petScale: 200,
    windowX: 20,
    windowY: 172,
  }, display)

  assert.ok(layout.group.height > display.height)
  assert.equal(layout.character.height, display.height)
  assert.equal(layout.group.y, 172)
  assert.ok(layout.character.y >= display.y)
  assert.ok(layout.character.y + layout.character.height > display.y + display.height)
  assert.ok(layout.group.y < display.y + display.height - 64)
})

test("pet layout permits partial overflow but retains a visible grab area", () => {
  const display = { x: 100, y: 50, width: 1200, height: 800 }
  const layout = calculatePetWindowLayout({
    ...DEFAULT_PET_SETTINGS,
    windowX: -500,
    windowY: 900,
  }, display)

  assert.equal(layout.group.x + layout.group.width, display.x + 64)
  assert.equal(layout.group.y, display.y + display.height - 64)
  assert.ok(layout.expandedBubble.x >= display.x + 8)
  assert.ok(layout.expandedBubble.y >= display.y + 8)
  assert.ok(layout.expandedBubble.x + layout.expandedBubble.width <= display.x + display.width - 8)
  assert.ok(layout.expandedBubble.y + layout.expandedBubble.height <= display.y + display.height - 8)
})

test("pet icon continuously compensates as the character moves through the left wall", () => {
  const positions = [140, 120, 100, 80, 60].map((windowX) => calculatePetWindowLayout({
    ...DEFAULT_PET_SETTINGS,
    windowX,
    windowY: 180,
  }, workArea))
  const visualXs = positions.map((layout) => layout.collapsedBubble.x + 4)

  assert.deepEqual(visualXs, [140, 120, 100, 100, 100])
  assert.ok(positions[4].collapsedBubble.x + 4 - positions[4].character.x > 0)
  assert.ok(positions.every((layout) => layout.iconPlacement.anchor === "top-left"))
})

test("pet icon changes to a screen-edge tab when vertical space runs out", () => {
  const top = calculatePetWindowLayout({
    ...DEFAULT_PET_SETTINGS,
    windowX: 400,
    windowY: -1000,
  }, workArea)
  const bottom = calculatePetWindowLayout({
    ...DEFAULT_PET_SETTINGS,
    windowX: 400,
    windowY: workArea.y + workArea.height,
  }, workArea)

  assert.equal(top.iconPlacement.anchor, "top-left")
  assert.equal(top.iconPlacement.edge, "top")
  assert.equal(top.collapsedBubble.y + 4, workArea.y)
  assert.equal(bottom.iconPlacement.edge, "bottom")
  assert.equal(bottom.collapsedBubble.y + bottom.collapsedBubble.height - 4, workArea.y + workArea.height)
})

test("pet icon edge state keeps a 16px release buffer without freezing its movement", () => {
  const display = { x: 100, y: 50, width: 1000, height: 700 }
  const entered = snapPetIconToWorkArea({ x: 95, y: 300, size: 40 }, display)
  const retained = snapPetIconToWorkArea({ x: 110, y: 300, size: 40 }, display, entered.edge)
  const released = snapPetIconToWorkArea({ x: 117, y: 300, size: 40 }, display, retained.edge)

  assert.deepEqual({ x: entered.x, edge: entered.edge }, { x: display.x, edge: "left" })
  assert.deepEqual({ x: retained.x, edge: retained.edge }, { x: 110, edge: "left" })
  assert.deepEqual({ x: released.x, edge: released.edge }, { x: 117, edge: "none" })
})

test("a full-height pet can move vertically instead of pinning y to the display top", () => {
  const display = { x: 0, y: 0, width: 1920, height: 1040 }
  const top = calculatePetWindowLayout({ ...DEFAULT_PET_SETTINGS, petScale: 200, windowY: -300 }, display)
  const bottom = calculatePetWindowLayout({ ...DEFAULT_PET_SETTINGS, petScale: 200, windowY: 600 }, display)

  assert.ok(top.group.height > display.height)
  assert.equal(bottom.group.height, top.group.height)
  assert.equal(top.group.y, -300)
  assert.equal(bottom.group.y, 600)
})

test("pet scale remains effective through 200%", () => {
  const display = { x: 0, y: 0, width: 1920, height: 1040 }
  const medium = calculatePetWindowLayout({ ...DEFAULT_PET_SETTINGS, petScale: 120 }, display)
  const maximum = calculatePetWindowLayout({ ...DEFAULT_PET_SETTINGS, petScale: 200 }, display)

  assert.ok(maximum.character.height > medium.character.height)
  assert.equal(maximum.character.height, display.height)
})
