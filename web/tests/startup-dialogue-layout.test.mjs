import assert from 'node:assert/strict'
import test from 'node:test'
import { dialogueBubbleLayout } from '../src/pages/startup/dialogue-bubble-layout.ts'

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
test('dialogue stays next to the character and below the top controls on a wide viewport', () => {
  const actor = { x: 80, y: 100, width: 250, height: 350 }
  const bubble = dialogueBubbleLayout(actor, { width: 960, height: 540 }, 96)
  assert.equal(overlaps(bubble, actor), false)
  assert.equal(bubble.tail, 'left')
  assert.ok(bubble.y >= 84 && bubble.x + bubble.width <= 944)
})
test('dialogue moves left when the character is beside the right edge', () => {
  const actor = { x: 750, y: 100, width: 190, height: 350 }
  const bubble = dialogueBubbleLayout(actor, { width: 960, height: 540 }, 96)
  assert.equal(overlaps(bubble, actor), false)
  assert.equal(bubble.tail, 'right')
  assert.ok(bubble.x + bubble.width <= actor.x)
})
test('phone dialogue uses the free band below a full-width character', () => {
  const actor = { x: 0, y: 110, width: 390, height: 590 }
  const bubble = dialogueBubbleLayout(actor, { width: 390, height: 844 }, 96)
  assert.equal(overlaps(bubble, actor), false)
  assert.equal(bubble.tail, 'top')
  assert.ok(bubble.y + bubble.height <= 828)
})
test('small windows keep the whole dialogue inside the viewport and below the toolbar', () => {
  const bubble = dialogueBubbleLayout({ x: 0, y: 50, width: 240, height: 180 }, { width: 240, height: 240 }, 120)
  assert.ok(bubble.x >= 16 && bubble.y >= 84)
  assert.ok(bubble.x + bubble.width <= 224 && bubble.y + bubble.height <= 224)
  assert.ok(bubble.tailOffset >= 22)
})
test('login dialogue fits between a desktop character head and the form', () => {
  const head = { x: 70, y: 100, width: 180, height: 150 }, panel = { x: 528, y: 60, width: 384, height: 420 }
  const bubble = dialogueBubbleLayout(head, { width: 960, height: 540 }, 96, { obstacles: [panel], maxWidth: 248 })
  assert.equal(overlaps(bubble, panel), false)
  assert.equal(overlaps(bubble, head), false)
  assert.ok(bubble.x >= head.x + head.width && bubble.x + bubble.width <= panel.x)
})
test('phone login dialogue stays beside the low character and below the form', () => {
  const head = { x: 55, y: 640, width: 135, height: 120 }, panel = { x: 20, y: 200, width: 350, height: 425 }
  const bubble = dialogueBubbleLayout(head, { width: 390, height: 844 }, 112, { obstacles: [panel], maxWidth: 178 })
  assert.equal(overlaps(bubble, panel), false)
  assert.equal(overlaps(bubble, head), false)
  assert.ok(bubble.y >= panel.y + panel.height && bubble.x + bubble.width <= 374)
  assert.ok(Math.abs(bubble.y - head.y) < 80)
})
