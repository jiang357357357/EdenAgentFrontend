import assert from 'node:assert/strict'
import test from 'node:test'
import { cancellableSpeechRequest } from '../src/lib/cancellable-speech-request.ts'

test('cancel is sent for the exact request and stops waiting before the upstream completes', async () => {
  const controller = new AbortController(), sent = []
  let finish
  const request = cancellableSpeechRequest(id => { sent.push(['start', id]); return new Promise(resolve => { finish = resolve }) }, async id => { sent.push(['cancel', id]) }, controller.signal)
  const rejected = assert.rejects(request, /abort/i)
  controller.abort(); await rejected
  assert.equal(sent.length, 2)
  assert.equal(sent[0][1], sent[1][1])
  finish('late audio')
})

test('pre-cancelled work never starts, completed work removes its cancel listener', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(cancellableSpeechRequest(async () => { throw new Error('must not start') }, async () => {}, controller.signal), /abort/i)
  const live = new AbortController(); let cancelled = false
  assert.equal(await cancellableSpeechRequest(async () => 'audio', async () => { cancelled = true }, live.signal), 'audio')
  live.abort(); assert.equal(cancelled, false)
})
