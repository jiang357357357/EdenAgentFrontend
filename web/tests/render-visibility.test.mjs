import assert from 'node:assert/strict'
import test from 'node:test'
import { observeRendererVisibility } from '../src/lib/render-visibility.ts'

function fixture(t, desktop = true) {
  const document = new EventTarget()
  document.hidden = false
  let nativeListener, unsubscribed = 0
  const previous = ['document', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  t.after(() => { for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  } })
  globalThis.document = document
  globalThis.window = desktop ? { edenAgentDesktop: {
    onMainWindowVisibility(listener) { nativeListener = listener; return () => { unsubscribed++ } },
  } } : {}
  return { document, native: visible => nativeListener(visible), unsubscribed: () => unsubscribed }
}

test('native hide/minimize pauses rendering even while Electron reports a visible document', t => {
  const f = fixture(t), frames = []
  const unsubscribe = observeRendererVisibility(visible => frames.push(visible))
  f.native(false)
  assert.equal(f.document.hidden, false)
  assert.deepEqual(frames, [true, false])
  f.native(true)
  assert.deepEqual(frames, [true, false, true])
  unsubscribe()
})

test('both native and document visibility must allow rendering, regardless of event order', t => {
  const f = fixture(t), frames = []
  const unsubscribe = observeRendererVisibility(visible => frames.push(visible))
  f.native(false)
  f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange'))
  f.native(true)
  assert.equal(frames.at(-1), false)
  f.document.hidden = false; f.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(frames.at(-1), true)
  f.native(false)
  f.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(frames.at(-1), false)
  unsubscribe()
})

test('unmount releases both subscriptions and ignores already queued native events', t => {
  const f = fixture(t), frames = []
  const unsubscribe = observeRendererVisibility(visible => frames.push(visible))
  unsubscribe()
  f.native(false)
  f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange'))
  assert.deepEqual(frames, [true])
  assert.equal(f.unsubscribed(), 1)
})

test('web and visible auxiliary pet windows continue rendering without a native subscription', t => {
  const f = fixture(t, false), frames = []
  const unsubscribe = observeRendererVisibility(visible => frames.push(visible))
  assert.deepEqual(frames, [true])
  f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(frames.at(-1), false)
  f.document.hidden = false; f.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(frames.at(-1), true)
  unsubscribe()
})
