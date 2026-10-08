import assert from 'node:assert/strict'
import test from 'node:test'
import { formatReplyTimer, replyTimerDurations, replyTimerElapsed, watchReplyTimer } from '../src/lib/reply-timer.ts'

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const snapshot = (turn = null, seq = '0', observedAt = 1000) => ({ turn, seq, observedAt })
const turn = (turnId = 'first', startedAt = 1000) => ({ turnId, startedAt, outcome: 'running' })
function fixture() {
  let now = 0, event, status, view
  const requests = [], unsubscribe = []
  const dispose = watchReplyTimer('session', {
    read() { const next = deferred(); requests.push(next); return next.promise },
    now: () => now, changed: next => { view = next },
    events(listener) { event = listener; return () => unsubscribe.push('events') },
    status(listener) { status = listener; return () => unsubscribe.push('status') },
  })
  const emit = (eventType, createdAt, seq, turnId = 'first', sessionId = 'session', payload = {}) =>
    event({ eventType, createdAt, seq: String(seq), turnId, sessionId, payload })
  return { requests, dispose, emit, unsubscribe, at: value => { now = value },
    status: value => status(value), view: () => view, elapsed: () => replyTimerElapsed(view, now),
    durations: () => replyTimerDurations(view, now) }
}

test('opening before the first message restores elapsed time and local ticking needs no additional requests', async () => {
  const f = fixture()
  f.requests[0].resolve(snapshot(turn(), '1', 6000)); await flush()
  assert.equal(f.elapsed(), 5000)
  f.at(10000); assert.equal(f.elapsed(), 15000)
  assert.equal(f.requests.length, 1)
  f.dispose()
})

test('tool messages, retries and queued inputs do not reset the clock; completion freezes it and the next start resets it', async () => {
  const f = fixture()
  f.requests[0].resolve(snapshot()); await flush()
  f.emit('turn.started', 1000, 1)
  f.at(5000)
  for (const type of ['agent.message_end', 'agent.retry_scheduled', 'input.queued', 'constructor']) f.emit(type, 5000, 2)
  assert.equal(f.elapsed(), 5000)
  f.emit('turn.completed', 7000, 3)
  f.at(50000); assert.equal(f.elapsed(), 6000)
  f.emit('turn.started', 9000, 4, 'second')
  assert.equal(f.elapsed(), 0)
  f.at(52000); assert.equal(f.elapsed(), 2000)
  assert.equal(f.requests.length, 1)
  f.dispose()
})

test('cancelled and failed turns retain exact time, and sibling sessions or duplicate events cannot change it', async () => {
  for (const [type, outcome] of [['input.interrupted', 'interrupted'], ['turn.failed', 'failed']]) {
    const f = fixture()
    f.requests[0].resolve(snapshot(turn(), '9007199254740993')); await flush()
    f.emit(type, 4200, '9007199254740994')
    f.emit('turn.started', 6000, '9007199254740995', 'other', 'sibling')
    f.emit('turn.started', 1000, '9007199254740993')
    f.at(90000)
    assert.equal(f.elapsed(), 3200)
    assert.equal(f.view().snapshot.turn.outcome, outcome)
    f.dispose()
  }
})

test('stale snapshots cannot overwrite a new live turn, even if the old request finishes later', async () => {
  const f = fixture()
  f.emit('turn.started', 10000, 20, 'new-turn')
  f.at(3000)
  f.requests[0].resolve(snapshot({ ...turn(), finishedAt: 8000, outcome: 'completed' }, '19', 9000)); await flush()
  assert.equal(f.view().snapshot.turn.turnId, 'new-turn')
  assert.equal(f.elapsed(), 3000)
  f.dispose()
})

test('reconnection reads one fresh snapshot, recovers a missed ending and does not create a polling loop', async () => {
  const f = fixture()
  f.status({ sessionId: 'session', connected: true })
  assert.equal(f.requests.length, 1)
  f.requests[0].resolve(snapshot(turn(), '1', 2000)); await flush()
  f.status({ sessionId: 'sibling', connected: false })
  assert.equal(f.view().connected, true)
  f.status({ sessionId: 'session', connected: false })
  f.at(10000); assert.equal(f.elapsed(), 11000)
  f.status({ sessionId: 'session', connected: true })
  f.requests[1].resolve(snapshot({ ...turn(), finishedAt: 6500, outcome: 'completed' }, '7', 20000)); await flush()
  assert.equal(f.elapsed(), 5500)
  f.status({ sessionId: 'session', connected: true })
  assert.equal(f.requests.length, 2)
  f.dispose()
})

test('unknown start requests restoration, reports read errors and disposes pending results on session/world changes', async () => {
  const f = fixture()
  f.emit('input.interrupted', 5000, 4)
  f.requests[0].resolve(snapshot(null, '0')); await flush()
  assert.equal(f.requests.length, 2)
  f.requests[1].reject(new Error('Server unavailable')); await flush()
  assert.match(f.view().error, /Server unavailable/)
  f.dispose()
  assert.deepEqual(f.unsubscribe, ['events', 'status'])
  const g = fixture()
  g.dispose(); g.requests[0].resolve(snapshot(turn(), '1', 9000)); await flush()
  assert.equal(g.view(), undefined)
})

test('timer formats seconds, minutes and hours without rolling completed time forward', () => {
  for (const [ms, text] of [[0, '00:00'], [999, '00:00'], [1000, '00:01'], [59999, '00:59'],
    [60000, '01:00'], [3723000, '1:02:03'], [-1, '00:00'], [NaN, '00:00']]) assert.equal(formatReplyTimer(ms), text)
})

test('live model and tool clocks follow existing session events, reset together and need no polling', async () => {
  const f = fixture()
  f.requests[0].resolve({ ...snapshot(null, '0', 1000), breakdown: {
    thinking: { elapsedMs: 0, activeIds: [] }, tools: { elapsedMs: 0, activeIds: [] }, turnElapsedMs: 10000,
  } }); await flush()
  f.emit('turn.started', 1000, 1)
  f.emit('model.request', 2000, 2, 'first', 'session', { requestId: 'model' })
  f.at(3000)
  assert.deepEqual(f.durations(), { thinkingMs: 3000, toolMs: 0, turnMs: 4000 })
  f.emit('model.response', 6000, 3, 'first', 'session', { requestId: 'model' })
  f.emit('operation.started', 7000, 4, 'first', 'session', { callId: 'tool' })
  f.emit('operation.completed', 10000, 5, 'first', 'session', { callId: 'tool' })
  f.emit('turn.completed', 11000, 6)
  f.at(90000)
  assert.deepEqual(f.durations(), { thinkingMs: 4000, toolMs: 3000, turnMs: 10000 })
  f.emit('turn.started', 100000, 7, 'second')
  assert.deepEqual(f.durations(), { thinkingMs: 0, toolMs: 0, turnMs: 0 })
  assert.equal(f.requests.length, 1)
  f.dispose()
})

test('reconnection replaces missed phase endings and stale initial reads restore detailed counters once', async () => {
  const f = fixture()
  f.emit('turn.started', 1000, 2)
  f.requests[0].resolve(snapshot(null, '1', 1000)); await flush()
  assert.equal(f.requests.length, 2)
  f.requests[1].resolve({ ...snapshot(turn(), '3', 6000), breakdown: {
    thinking: { elapsedMs: 0, activeSince: 2000, activeIds: ['model'] },
    tools: { elapsedMs: 0, activeIds: [] }, turnElapsedMs: 5000,
  } }); await flush()
  assert.equal(f.durations().thinkingMs, 4000)
  f.status({ sessionId: 'session', connected: true }); await flush()
  f.requests[2].resolve({ ...snapshot({ ...turn(), outcome: 'completed', finishedAt: 9000 }, '6', 99000), breakdown: {
    thinking: { elapsedMs: 6000, activeIds: [] }, tools: { elapsedMs: 1000, activeIds: [] }, turnElapsedMs: 8000,
  } }); await flush()
  f.at(999000)
  assert.deepEqual(f.durations(), { thinkingMs: 6000, toolMs: 1000, turnMs: 8000 })
  f.dispose()
})
