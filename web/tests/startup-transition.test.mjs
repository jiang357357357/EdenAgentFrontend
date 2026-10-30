import assert from 'node:assert/strict'
import test from 'node:test'
import { SceneTransition } from '../src/pages/startup/scene-transition.ts'
import { foregroundLayout, overlaps } from '../src/pages/startup/foreground-layout.ts'

const duration = 7 / 6
function at(seconds) {
  const transition = new SceneTransition(duration); transition.command('wake')
  for (let elapsed = 0; elapsed < seconds;) { const step = Math.min(.25, seconds - elapsed); transition.update(step); elapsed += step }
  return transition
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`)

test('original order preserves reaction and the 400ms exit before any foreground opacity', () => {
  const reaction = at(.5).frame
  assert.equal(reaction.phase, 'reacting'); assert.equal(reaction.actorAlpha, 1)
  assert.equal(reaction.foregroundAlpha, 0); assert.equal(reaction.exitFlash, 0)
  const exit = at(duration + .1).frame
  assert.equal(exit.phase, 'exit-flash'); assert.equal(exit.actorAlpha, 0); assert.equal(exit.foregroundAlpha, 0)
  near(exit.exitFlash, .8 * 216 / 255); near(exit.blur, .15625)
})
test('original entry fades in over 120ms and finishes after the 700ms entry stage', () => {
  const entry = at(duration + .46).frame
  assert.equal(entry.phase, 'enter-flash'); near(entry.foregroundAlpha, .5)
  near(entry.entryFlash, .88 * 216 / 255); assert.equal(entry.blur, 1)
  const stable = at(duration + 1.11).frame
  assert.equal(stable.phase, 'login'); assert.equal(stable.foregroundAlpha, 1)
  assert.equal(stable.entryFlash, 0); assert.equal(stable.exitFlash, 0)
})
test('return crossfades from the current opacity and blur over 250ms', () => {
  const transition = at(duration + .46)
  transition.command('room'); const halfway = transition.update(.125)
  assert.equal(halfway.phase, 'returning'); near(halfway.foregroundAlpha, .25)
  near(halfway.actorAlpha, .75); near(halfway.blur, .5)
  assert.equal(transition.update(.126).phase, 'room')
  transition.command('wake'); assert.equal(transition.frame.phase, 'reacting'); near(transition.frame.elapsed, 0)
})
test('cancel during reaction restores the room and skip enters login immediately', () => {
  const transition = at(.5); transition.command('room')
  assert.equal(transition.frame.foregroundAlpha, 0)
  assert.equal(transition.update(.25).phase, 'room')
  transition.command('login'); assert.equal(transition.frame.phase, 'login')
  assert.equal(transition.frame.foregroundAlpha, 1); assert.equal(transition.frame.entryFlash, 0)
})
test('delayed frames use the original 500ms transition time clamp', () => {
  const transition = new SceneTransition(duration); transition.command('wake'); transition.update(10)
  near(transition.frame.elapsed, .5); assert.equal(transition.frame.phase, 'reacting')
})
test('foreground keeps the original low framing while avoiding live login controls', () => {
  const controls = [{ x: 530, y: 44, width: 384, height: 450 }]
  const rect = foregroundLayout(960, 540, controls, .52)
  assert.ok(rect); near(rect.y, 540 * .17)
  assert.equal(overlaps(rect, controls[0]), false)
  assert.ok(rect.y + rect.height > 540, 'the source deliberately crops the lower body')
})
test('foreground disappears when native controls leave insufficient room', () => {
  assert.equal(foregroundLayout(800, 500, [{ x: 0, y: 0, width: 800, height: 500 }], .52), undefined)
})
test('phone layout can use the original lower free region without covering the panel', () => {
  const panel = { x: 20, y: 195, width: 350, height: 454 }
  const rect = foregroundLayout(390, 844, [panel], .52)
  assert.ok(rect); assert.equal(overlaps(rect, panel), false)
  assert.ok(rect.y < 844 - 160); assert.ok(rect.y > panel.y + panel.height)
})
