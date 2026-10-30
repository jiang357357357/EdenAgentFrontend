import assert from 'node:assert/strict'
import test from 'node:test'
import { sceneResolution } from '../src/pages/startup/scene-resolution.ts'

test('scene resolution keeps native standard, fractional and high pixel ratios', () => {
  for (const ratio of [.8, 1, 1.25, 1.5, 2, 2.5, 3]) assert.equal(sceneResolution(ratio, 1920, 1080, 16384), ratio)
})
test('only the actual GPU texture size limits native resolution', () => {
  assert.equal(sceneResolution(3, 8000, 4500, 16384), 16384 / 8000)
  assert.equal(sceneResolution(2, 960, 540, 1024), 1024 / 960)
})
test('invalid device ratios and missing GPU limits have safe defaults', () => {
  for (const ratio of [NaN, Infinity, 0, -1]) assert.equal(sceneResolution(ratio, 1920, 1080, 16384), 1)
  assert.equal(sceneResolution(2, 0, 0, Infinity), 2)
  assert.equal(sceneResolution(2, 1920, 1080, 0), 2)
})
