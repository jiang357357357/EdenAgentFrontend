import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(() => vite.close())
const client = await vite.ssrLoadModule('/src/lib/agent-client.ts')
const reducer = await vite.ssrLoadModule('/src/lib/session-reducer.ts')

const base = {
  sessionId: 'session',
  turnId: 'turn',
  seq: 1n,
  createdAt: 1n,
}

test('a model retry removes the failed partial response and remains visible until retry completion', () => {
  const project = client.createSessionEventProjector()
  const start = project({
    ...base,
    id: 'failed-assistant',
    eventType: 'agent.message_start',
    payload: { type: 'message_start', message: { role: 'assistant', content: [], provider: 'recorded', model: 'recorded', timestamp: 1 } },
  })
  assert.ok(start.some(event => event.type === 'message.updated'))

  const scheduled = project({
    ...base,
    id: 'retry-scheduled',
    seq: 2n,
    eventType: 'agent.retry_scheduled',
    payload: { operation: 'model', attempt: 1, maxAttempts: 2, delayMs: 500, errorMessage: 'terminated' },
  })
  assert.deepEqual(scheduled.map(event => event.type), ['message.removed', 'session.status'])
  assert.deepEqual(client.projectMessageEvents([
    {
      ...base,
      id: 'failed-assistant',
      eventType: 'agent.message_start',
      payload: { type: 'message_start', message: { role: 'assistant', content: [], provider: 'recorded', model: 'recorded', timestamp: 1 } },
    },
    {
      ...base,
      id: 'retry-scheduled',
      seq: 2n,
      eventType: 'agent.retry_scheduled',
      payload: { operation: 'model', attempt: 1, maxAttempts: 2, delayMs: 500, errorMessage: 'terminated' },
    },
  ]), [])

  let state = structuredClone(reducer.initialRuntimeState)
  for (const event of start.concat(scheduled)) state = reducer.runtimeReducer(state, { type: 'event', event })
  assert.equal(state.sessions.session.messages['failed-assistant'], undefined)
  assert.deepEqual(state.sessions.session.modelRetry, {
    attempt: 1,
    maxAttempts: 2,
    delayMs: 500,
    errorMessage: 'terminated',
  })

  const attempt = project({ ...base, id: 'retry-attempt', seq: 3n, eventType: 'agent.retry_attempt_start', payload: { operation: 'model', attempt: 1 } })
  state = reducer.runtimeReducer(state, { type: 'event', event: attempt[0] })
  assert.equal(state.sessions.session.status, 'busy')
  assert.equal(state.sessions.session.modelRetry.attempt, 1)

  const finished = project({ ...base, id: 'retry-finished', seq: 4n, eventType: 'agent.retry_finished', payload: { operation: 'model', attempt: 1, success: true } })
  state = reducer.runtimeReducer(state, { type: 'event', event: finished[0] })
  assert.equal(state.sessions.session.modelRetry, undefined)
})
