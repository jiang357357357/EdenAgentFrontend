import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { filterChatEvents } = await vite.ssrLoadModule('/src/lib/chat-event-filter.ts')
const { runtimeReducer, initialRuntimeState, applyRuntimeEvent } = await vite.ssrLoadModule('/src/lib/session-reducer.ts')
const { projectSessionEvent } = await vite.ssrLoadModule('/src/lib/rpc-transport.ts')
after(() => vite.close())
const flush = () => new Promise(resolve => setImmediate(resolve))
const event = (type, sessionID, extra = {}) => ({ type, properties: { sessionID, ...extra } })
test('background stream cannot create phantom chats; approvals still arrive', async () => {
  let resolveVisibility, calls = 0, state = initialRuntimeState
  const delivered = []
  const receive = filterChatEvents(() => { calls++; return new Promise(resolve => { resolveVisibility = resolve }) }, update => {
    delivered.push(update); state = runtimeReducer(state, applyRuntimeEvent(update))
  })
  receive(event('session.status', 'wake', { status: { type: 'busy' } }))
  receive(event('session.status', 'wake', { status: { type: 'idle' } }))
  receive({ type: 'permission.mode', properties: { mode: 'restricted' } })
  resolveVisibility(true)
  await flush()
  assert.equal(calls, 1)
  assert.deepEqual(state.sessionOrder, [])
  assert.deepEqual(delivered.map(item => item.type), ['permission.mode'])
})
test('foreground completion stays ordered behind async classification and returns idle', async () => {
  let resolveVisibility, state = initialRuntimeState
  const receive = filterChatEvents(() => new Promise(resolve => { resolveVisibility = resolve }), update => {
    state = runtimeReducer(state, applyRuntimeEvent(update))
  })
  for (const eventType of ['turn.started', 'turn.completed']) {
    for (const update of projectSessionEvent({ id: eventType, sessionId: 'chat', turnId: 'turn', eventType, payload: {}, seq: 1, createdAt: 1 })) receive(update)
  }
  resolveVisibility(false)
  await flush()
  assert.equal(state.sessions.chat.status, 'idle')
})
