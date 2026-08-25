import assert from "node:assert/strict"
import test from "node:test"

import {
  calculateVertexBounds,
  calculateSpinePlacement,
  isMemoryLobbySpineAsset,
  MEMORY_LOBBY_CAMERA_SCALE,
  MEMORY_LOBBY_CAMERA_Y_BIAS,
  normalizeSpineBounds,
  resolveMemoryLobbyCameraSlots,
  resolveSpineLayout,
  selectExactSpineAsset,
  selectSpineAsset,
} from "../src/components/character/renderer/spine/spine-layout.ts"

const closeTo = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be close to ${expected}`)
}

test("memory-lobby scenes cover the viewport using the BG attachment camera", () => {
  const bounds = calculateVertexBounds([
    -1737, -2248, 1737, -2248,
    1737, 334, -1737, 334,
  ])
  assert.ok(bounds)
  const placement = calculateSpinePlacement({
    bounds,
    viewportWidth: 920,
    viewportHeight: 1000,
    padding: 0,
    fit: "cover",
    verticalAlignment: "center",
  })

  assert.ok(placement)
  closeTo(bounds.x, -1737)
  closeTo(bounds.y, -2248)
  closeTo(bounds.width, 3474)
  closeTo(bounds.height, 2582)
  closeTo(placement.scale, 1000 / 2582)
  assert.ok(3474 * placement.scale > 920)
  closeTo(2582 * placement.scale, 1000)
})

test("memory-lobby framing overscans and crops the lower safety margin", () => {
  const viewportHeight = 1000
  const bounds = { x: -1737, y: -2248, width: 3474, height: 2582 }
  const placement = calculateSpinePlacement({
    bounds,
    viewportWidth: 920,
    viewportHeight,
    padding: 0,
    assetScale: MEMORY_LOBBY_CAMERA_SCALE,
    offsetY: viewportHeight * MEMORY_LOBBY_CAMERA_Y_BIAS,
    fit: "cover",
    verticalAlignment: "center",
  })

  assert.ok(placement)
  const renderedTop = bounds.y * placement.scale + placement.y
  const renderedBottom = (bounds.y + bounds.height) * placement.scale + placement.y
  assert.ok(renderedTop < 0)
  assert.ok(renderedBottom > viewportHeight)
  assert.ok(renderedBottom - viewportHeight > -renderedTop)
})

test("standee models keep their feet aligned to the panel bottom", () => {
  const placement = calculateSpinePlacement({
    bounds: { x: -100, y: -20, width: 400, height: 800 },
    viewportWidth: 600,
    viewportHeight: 1000,
    padding: 20,
    verticalAlignment: "bottom",
  })

  assert.ok(placement)
  closeTo((800 - 20) * placement.scale + placement.y, 980)
})

test("Spine layout only follows the explicit API field", () => {
  assert.equal(resolveSpineLayout("memory-lobby"), "memory-lobby")
  assert.equal(resolveSpineLayout("standee"), "standee")
  assert.equal(resolveSpineLayout("memory_lobby"), undefined)
  assert.equal(resolveSpineLayout(undefined), undefined)
  assert.equal(isMemoryLobbySpineAsset({ layout: "memory-lobby" }), true)
  assert.equal(isMemoryLobbySpineAsset({ layout: "standee" }), false)
})

test("selects ordinary and memory-lobby variants by rendering context", () => {
  const standee = { id: 1, layout: "standee", enabled: true }
  const memoryLobby = { id: 2, layout: "memory-lobby", enabled: true }
  const assets = [memoryLobby, standee]

  assert.equal(selectSpineAsset(assets, memoryLobby, "standee"), standee)
  assert.equal(selectSpineAsset(assets, standee, "memory-lobby"), memoryLobby)
})

test("falls back to the available legacy Spine asset", () => {
  const memoryLobby = { id: 2, layout: "memory-lobby", enabled: true }
  assert.equal(selectSpineAsset(undefined, memoryLobby, "standee"), memoryLobby)
  assert.equal(selectSpineAsset([], { ...memoryLobby, enabled: false }, "standee"), undefined)
})

test("selects costume before Spine layout", () => {
  const defaultStandee = { id: 1, costume_key: "default", layout: "standee", enabled: true }
  const summerStandee = { id: 2, costume_key: "summer", layout: "standee", enabled: true }
  const summerLobby = { id: 3, costume_key: "summer", layout: "memory-lobby", enabled: true }
  assert.equal(
    selectSpineAsset([defaultStandee, summerLobby, summerStandee], defaultStandee, "standee", "summer"),
    summerStandee,
  )
})

test("exact selection never crosses costume or layout boundaries", () => {
  const defaultStandee = { id: 1, costume_key: "default", layout: "standee", enabled: true }
  const summerLobby = { id: 2, costume_key: "summer", layout: "memory-lobby", enabled: true }

  assert.equal(selectExactSpineAsset([defaultStandee, summerLobby], "summer", "memory-lobby"), summerLobby)
  assert.equal(selectExactSpineAsset([defaultStandee, summerLobby], "summer", "standee"), undefined)
  assert.equal(selectExactSpineAsset([defaultStandee, summerLobby], "default", "memory-lobby"), undefined)
})

test("memory-lobby camera slots default to BG and allow metadata overrides", () => {
  assert.deepEqual(resolveMemoryLobbyCameraSlots(undefined), ["BG"])
  assert.deepEqual(resolveMemoryLobbyCameraSlots({ camera_slot: "MainBackground" }), ["MainBackground"])
  assert.deepEqual(resolveMemoryLobbyCameraSlots({ cameraSlots: ["BG", "Backdrop"] }), ["BG", "Backdrop"])
})

test("invalid attachment vertices do not produce a camera frame", () => {
  assert.equal(calculateVertexBounds([]), undefined)
  assert.equal(calculateVertexBounds([0, 0, Number.NaN, 1]), undefined)
  assert.equal(calculateVertexBounds([0, 0, 0, 0]), undefined)
})

test("invalid Spine bounds are ignored instead of producing a broken transform", () => {
  assert.equal(normalizeSpineBounds({ x: 0, y: 0, width: 0, height: 1080 }), undefined)
  assert.equal(normalizeSpineBounds({ x: Number.NaN, y: 0, width: 720, height: 1080 }), undefined)
  assert.deepEqual(
    normalizeSpineBounds({ x: -723, y: -1451, width: 1261, height: 2781 }),
    { x: -723, y: -1451, width: 1261, height: 2781 },
  )
  assert.equal(calculateSpinePlacement({
    bounds: { x: 0, y: 0, width: 0, height: 1080 },
    viewportWidth: 680,
    viewportHeight: 960,
    padding: 10,
  }), undefined)
})
