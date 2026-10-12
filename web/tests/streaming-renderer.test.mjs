import assert from "node:assert/strict"
import { test } from "node:test"
import { measureStreamingPerformance } from "../scripts/measure-streaming-performance.mjs"

test("real isolated Electron rendering bounds reveal work and preserves completed/reset text", {
  timeout: 90_000, skip: process.platform !== "win32" ? "Windows desktop renderer acceptance" : false,
}, async () => {
  const result = await measureStreamingPerformance()
  assert.equal(result.projection.unchangedViews, 60)
  assert.equal(result.projection.matchedSelectors, 60)
  assert.equal(result.projection.totalTokens, 12_000)
  assert.ok(result.renderer.reveals <= 22, JSON.stringify(result.renderer))
  assert.ok(result.renderer.reveals > 0, "StrictMode must restart the reveal after effect cleanup")
  assert.equal(result.renderer.stableParagraph, true)
  assert.equal(result.renderer.completionImmediate, true)
  assert.equal(result.renderer.resetImmediate, true)
  assert.equal(result.renderer.sessionIsolated, true)
  assert.equal(result.renderer.framesAfterUnmount, 0)
  assert.equal(result.renderer.collapsedThinkingFrames, 0)
})
