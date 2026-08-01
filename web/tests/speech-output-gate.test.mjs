import assert from "node:assert/strict"
import test from "node:test"

import { SpeechOutputGate } from "../src/lib/speech-output-gate.ts"

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test("keeps speech output active until the complete playback queue settles", async () => {
  const changes = []
  const queue = deferred()
  const gate = new SpeechOutputGate(false, (pending) => changes.push(pending))

  gate.holdUntil(queue.promise)
  assert.equal(gate.active, true)
  assert.deepEqual(changes, [true])

  await Promise.resolve()
  assert.equal(gate.active, true)

  queue.resolve()
  await queue.promise
  await Promise.resolve()
  assert.equal(gate.active, false)
  assert.deepEqual(changes, [true, false])
})

test("an older playback queue cannot release a newer speech turn", async () => {
  const first = deferred()
  const second = deferred()
  const gate = new SpeechOutputGate(false, () => undefined)

  gate.holdUntil(first.promise)
  gate.holdUntil(second.promise)
  first.resolve()
  await first.promise
  await Promise.resolve()
  assert.equal(gate.active, true)

  second.resolve()
  await second.promise
  await Promise.resolve()
  assert.equal(gate.active, false)
})

test("reset invalidates a late queue completion", async () => {
  const queue = deferred()
  const gate = new SpeechOutputGate(false, () => undefined)

  gate.holdUntil(queue.promise)
  gate.reset(false)
  queue.resolve()
  await queue.promise
  await Promise.resolve()
  assert.equal(gate.active, false)
})
