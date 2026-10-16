import assert from 'node:assert/strict'
import test from 'node:test'
import { selfAwakeElapsed, selfAwakeRecordMatches, selfAwakeUsage } from '../src/lib/self-awake-metrics.ts'

const event = (kind, requestId, usage) => ({ kind, payload: { requestId, usage } })
const request = id => event('model.request', id)
const response = (id, usage) => event('model.response', id, usage)
const record = events => ({ run: { id: 'selected' }, events })
const usage = { input: 100, output: 10, cacheRead: 20, cacheWrite: 5, reasoning: 4, totalTokens: 135 }

test('totals every model request including cache, without counting reasoning twice', () => {
  const result = selfAwakeUsage(record([request('a'), response('a', usage), request('b'),
    response('b', { input: 3, output: 2, cacheRead: 5, cacheWrite: 0, totalTokens: 10 })]), 'selected')
  assert.deepEqual(result, { requests: 2, responses: 2, complete: true, total: 145, recorded: 145,
    input: 103, output: 12, cacheRead: 25, cacheWrite: 5 })
})

test('prefers the provider total and deduplicates replayed request and response events', () => {
  const reply = response('a', { ...usage, totalTokens: 140 })
  const result = selfAwakeUsage(record([request('a'), request('a'), reply, reply]), 'selected')
  assert.equal(result.total, 140)
  assert.equal(result.requests, 1)
  assert.equal(result.responses, 1)
})

test('uses normalized components only when all four counts are available', () => {
  assert.equal(selfAwakeUsage(record([response('a', { ...usage, totalTokens: undefined })]), 'selected').total, 135)
  for (const missing of ['input', 'output', 'cacheRead', 'cacheWrite']) {
    const incomplete = { ...usage, totalTokens: undefined, [missing]: undefined }
    assert.equal(selfAwakeUsage(record([response('a', incomplete)]), 'selected').total, null)
  }
})

test('distinguishes a partial recorded amount from a complete execution total', () => {
  for (const last of [[], [response('b')], [response('b', { totalTokens: -1 })]]) {
    const result = selfAwakeUsage(record([request('a'), response('a', usage), request('b'), ...last]), 'selected')
    assert.equal(result.complete, false)
    assert.equal(result.total, null)
    assert.equal(result.recorded, 135)
  }
})

test('never borrows usage from a different selected execution or malformed history', () => {
  for (const value of [null, [], {}, { run: { id: 'other' }, events: [response('a', usage)] },
    record([null, {}, event('agent.message_update', 'a', usage)])]) {
    const result = selfAwakeUsage(value, 'selected')
    assert.equal(result.total, null)
    assert.equal(result.recorded, null)
    assert.equal(result.responses, 0)
  }
  assert.equal(selfAwakeRecordMatches(record([]), 'selected'), true)
  assert.equal(selfAwakeRecordMatches(record([]), 'other'), false)
})

test('zero is a known count while missing, invalid and overflowing counts are unknown', () => {
  assert.equal(selfAwakeUsage(record([response('a', { totalTokens: 0 })]), 'selected').total, 0)
  for (const totalTokens of [undefined, null, '12', -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(selfAwakeUsage(record([response('a', { totalTokens })]), 'selected').total, null)
  }
  assert.equal(selfAwakeUsage(record([response('a', { totalTokens: Number.MAX_SAFE_INTEGER }),
    response('b', { totalTokens: 1 })]), 'selected').total, null)
})

test('completed execution duration uses persisted boundaries, not diary time or current time', () => {
  const result = selfAwakeElapsed({ run: { id: 'selected', status: 'completed', startedAt: 1000, completedAt: 12_340 } },
    'selected', { status: 'running', startedAt: '1970-01-01T00:00:00Z' }, 99_000)
  assert.deepEqual(result, { running: false, durationMs: 11_340 })
})

test('active execution duration advances and falls back only to the selected run timestamps', () => {
  const timing = { status: 'running', startedAt: '1970-01-01T00:00:01Z' }
  const stale = { run: { id: 'old', startedAt: 0, completedAt: 10_000 } }
  assert.deepEqual(selfAwakeElapsed(stale, 'selected', timing, 4500), { running: true, durationMs: 3500 })
  assert.equal(selfAwakeElapsed(stale, 'selected', timing, 5500).durationMs, 4500)
})

test('missing terminal boundaries and invalid dates do not invent durations', () => {
  for (const run of [
    { status: 'completed', startedAt: 1000 }, { status: 'failed', startedAt: 1000 },
    { status: 'completed', startedAt: 'bad', completedAt: 2000 },
    { status: 'completed', startedAt: 2000, completedAt: 1000 },
    { status: 'running', startedAt: null },
  ]) assert.equal(selfAwakeElapsed({ run: { ...run, id: 'selected' } }, 'selected', { status: 'completed' }, 3000).durationMs, undefined)
})
