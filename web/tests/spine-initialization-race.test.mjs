import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [loaderSource, canvasSource] = await Promise.all([
  readFile(new URL("../src/lib/spine-loader.ts", import.meta.url), "utf8"),
  readFile(
    new URL("../src/components/character/renderer/spine/SpineCharacterCanvas.tsx", import.meta.url),
    "utf8",
  ),
])

test("Spine uses skeleton-derived bounds instead of depending on the first Pixi mesh render", () => {
  assert.match(loaderSource, /new SkinsAndAnimationBoundsProvider\(boundsAnimation, boundsSkins\)/)
  assert.match(loaderSource, /new Spine\(\{ skeletonData, autoUpdate: false, boundsProvider \}\)/)
  assert.match(canvasSource, /model\.boundsProvider\?\.calculateBounds\(model\)/)
  assert.match(canvasSource, /modelBoundsRef\.current \?\? normalizeSpineBounds\(spine\.getLocalBounds\(\)\)/)
  assert.match(canvasSource, /if \(!bounds\) return false/)
})

test("a zero-sized mount waits for ResizeObserver without exhausting the fit retry budget", () => {
  const fitUntilReady = canvasSource.match(
    /const fitUntilReady = \(attempt = 0\) => \{([\s\S]*?)\n    \}/,
  )?.[1] ?? ""
  const resizeObserver = canvasSource.match(
    /const observer = new ResizeObserver\(\(\) => \{([\s\S]*?)\n    \}\)/,
  )?.[1] ?? ""

  assert.match(fitUntilReady, /if \(!syncRendererToHost\(\)\) return/)
  assert.match(fitUntilReady, /scheduleFitUntilReady\(attempt \+ 1\)/)
  assert.match(resizeObserver, /if \(!syncRendererToHost\(\)\) return/)
  assert.match(resizeObserver, /scheduleFitUntilReady\(\)/)
})
