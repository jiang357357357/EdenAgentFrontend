import test from 'node:test'
import assert from 'node:assert/strict'
import { SpeechRetryBudget, speechFailureRetryable } from '../src/lib/speech-retry-budget.ts'
test('automatic failures have a finite budget across revisions and manual retry resets only its message', () => {
  const budget = new SpeechRetryBudget(), transient = { data: { retryable: true, outcome: 'failed' } }
  for (let index = 0; index < 4; index++) { budget.check('session:one', 'same config and text'); budget.failed('session:one', 'same config and text', transient) }
  assert.throws(() => budget.check('session:one', 'same config and text'), /自动语音已暂停/)
  assert.throws(() => budget.check('session:one', 'new chunk'), /自动语音已暂停/)
  budget.check('session:two', 'same config and text')
  budget.failed('session:two', 'same config and text', { data: { retryable: false } })
  budget.reset('session:one'); budget.check('session:one', 'same config and text')
  assert.throws(() => budget.check('session:two', 'new chunk'), /自动语音已暂停/)
})
test('opaque HTTP/network/cancel outcomes do not start another automatic operation', () => {
  for (const error of [new Error('RPC timed out'), new Error('connection lost'), { data: { outcome: 'unknown', retryable: false } }]) assert.equal(speechFailureRetryable(error), false)
  assert.equal(speechFailureRetryable({ data: { retryable: true } }), true)
})
