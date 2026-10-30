const assert = require('node:assert/strict')
const test = require('node:test')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { controlBounds, readControlPlacement, saveControlPlacement } = require('../src/desktop-control/control-layout.cjs')

test('floating controls remain inside the work area after moving monitors or changing scale', () => {
  const screen = { getDisplayMatching: () => ({ workArea: { x: -1280, y: 0, width: 1280, height: 720 } }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 40, width: 1920, height: 1040 } }), getCursorScreenPoint: () => ({ x: 1, y: 1 }) }
  assert.deepEqual(controlBounds(screen), { x: 1476, y: 64, width: 420, height: 176 })
  assert.deepEqual(controlBounds(screen, { x: 4000, y: 1000 }), { x: -420, y: 544, width: 420, height: 176 })
  assert.deepEqual(controlBounds(screen, { x: -1200, y: 80 }), { x: -1200, y: 80, width: 420, height: 176 })
})

test('position and pin setting persist without storing account or task data', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'eden-control-layout-'))
  t.after(() => { assert.equal(path.dirname(root), path.resolve(tmpdir())); rmSync(root, { recursive: true, force: true }) })
  const file = path.join(root, 'position.json')
  assert.deepEqual(readControlPlacement(file), { topmost: true })
  saveControlPlacement(file, { x: -100, y: 80, topmost: false })
  assert.deepEqual(readControlPlacement(file), { x: -100, y: 80, topmost: false })
})
