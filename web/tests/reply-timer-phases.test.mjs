import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceTimerBreakdown, timerBreakdownElapsed } from '../src/lib/reply-timer-phases.ts'

const empty = () => ({ thinking: { elapsedMs: 0, activeIds: [] }, tools: { elapsedMs: 0, activeIds: [] }, turnElapsedMs: 0 })
function fixture() {
  let snapshot = { turn: { turnId: 'turn', startedAt: 1000, outcome: 'running' }, observedAt: 1000, breakdown: empty() }
  let seq = 0
  return {
    event(eventType, time, payload = {}) {
      const turn = eventType === 'turn.completed' ? { ...snapshot.turn, outcome: 'completed', finishedAt: time } : snapshot.turn
      const event = { eventType, sessionId: 'session', turnId: 'turn', seq: String(++seq), createdAt: time, payload }
      snapshot = { ...snapshot, turn, observedAt: time, breakdown: advanceTimerBreakdown(snapshot, event, turn, time) }
    },
    elapsed: (extra = 0) => timerBreakdownElapsed(snapshot, extra), snapshot: () => snapshot,
  }
}

test('models and tools tick independently, retry gaps are excluded and completion freezes every clock', () => {
  const f = fixture()
  f.event('model.request', 2000, { requestId: 'one' })
  assert.deepEqual(f.elapsed(3000), { thinkingMs: 3000, toolMs: 0, turnMs: 4000 })
  f.event('model.response', 6000, { requestId: 'one' })
  f.event('operation.started', 7000, { callId: 'tool' })
  f.event('operation.completed', 10000, { callId: 'tool' })
  f.event('model.request', 11000, { requestId: 'two' })
  f.event('model.response', 14000, { requestId: 'two' })
  f.event('turn.completed', 15000)
  assert.deepEqual(f.elapsed(99000), { thinkingMs: 7000, toolMs: 3000, turnMs: 14000 })
})

test('parallel tools use elapsed wall time, duplicates and unrelated endings cannot close another call', () => {
  const f = fixture()
  f.event('operation.started', 2000, { callId: 'a' })
  f.event('operation.started', 3000, { callId: 'b' })
  f.event('operation.completed', 4000, { callId: 'unknown' })
  f.event('operation.started', 5000, { callId: 'a' })
  f.event('operation.completed', 6000, { callId: 'a' })
  f.event('operation.completed', 8000, { callId: 'b' })
  assert.equal(f.elapsed().toolMs, 6000)
})

test('a stop closes open phases and the next turn resets all three clocks', () => {
  const f = fixture()
  f.event('operation.started', 2000, { callId: 'a' })
  const old = f.snapshot(), stopped = { ...old.turn, outcome: 'interrupted', finishedAt: 5000 }
  const breakdown = advanceTimerBreakdown(old, { eventType: 'input.interrupted' }, stopped, 5000)
  assert.deepEqual(breakdown.tools, { elapsedMs: 3000, activeIds: [] })
  const next = { turnId: 'next', startedAt: 15000, outcome: 'running' }
  const started = advanceTimerBreakdown({ ...old, turn: stopped, observedAt: 5000, breakdown }, { eventType: 'turn.started' }, next, 15000)
  assert.equal(started.turnElapsedMs, 0)
  assert.deepEqual(started.thinking, { elapsedMs: 0, activeIds: [] })
  assert.deepEqual(started.tools, { elapsedMs: 0, activeIds: [] })
})

test('old servers or missing turn boundaries report unavailable detail rather than invented phase totals', () => {
  assert.equal(timerBreakdownElapsed({ turn: null, observedAt: 1000 }, 0), undefined)
  const f = fixture()
  assert.equal(advanceTimerBreakdown(f.snapshot(), { eventType: 'turn.started' },
    { turnId: 'unknown-next', startedAt: 5000, outcome: 'running' }, 5000), undefined)
})
