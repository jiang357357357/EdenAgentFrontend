import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const vite = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const [client, state] = await Promise.all([vite.ssrLoadModule('/src/lib/agent-client.ts'), vite.ssrLoadModule('/src/lib/session-reducer.ts')])
const sessionId = 'session'
const event = (id, eventType, payload, seq, actor) => ({ id, sessionId, turnId: 'turn', eventType,
  payload: { ...payload, ...(actor ? { actor: { assistantID: actor } } : {}) }, seq: String(seq), createdAt: 1000 + seq })
const message = (id, role, seq) => event(id, 'agent.message_end', { messageId: id, message: { role,
  content: [{ type: 'text', text: id }] } }, seq)
const sticker = (id, seq, actor) => event(id, 'character.sticker.sent', { part: { stickerId: seq, characterId: 9,
  name: id, url: `https://fixture.invalid/${id}.gif`, alt: '表情' } }, seq, actor)
const events = [message('user', 'user', 1), message('tool', 'assistant', 2), sticker('image', 3), message('final', 'assistant', 4)]
const hydrate = items => state.hydrateSessionMessages(sessionId, { items, hasMore: false })
const reduce = state.runtimeReducer
function live(input, initial = state.initialRuntimeState) {
  const project = client.createSessionEventProjector()
  for (const row of input) for (const update of project(row)) initial = reduce(initial, state.applyRuntimeEvent(update))
  return initial
}
function assertImage(runtime, id = 'image') {
  const stored = runtime.sessions[sessionId].messages[id]
  assert.equal(stored.role, 'assistant'); assert.equal(stored.runID, 'turn')
  assert.equal(stored.partOrder.length, 1)
  const part = stored.parts[stored.partOrder[0]]
  assert.equal(part.type, 'sticker'); assert.equal(part.url, `https://fixture.invalid/${id}.gif`)
  return part
}

test('reopening reconstructs the same independent sticker message and image as the live stream', () => {
  const visible = live(events), restored = reduce(state.initialRuntimeState, hydrate(client.projectMessageEvents(events)))
  assert.deepEqual(visible.sessions[sessionId].messageOrder, ['user', 'tool', 'image', 'final'])
  assert.deepEqual(restored.sessions[sessionId].messageOrder, visible.sessions[sessionId].messageOrder)
  assert.deepEqual(assertImage(restored), assertImage(visible))
})

test('a sticker-only page and event before any model message both restore without an orphan shell', () => {
  for (const runtime of [live([events[2]]), reduce(state.initialRuntimeState, hydrate(client.projectMessageEvents([events[2]])))]) {
    assert.deepEqual(runtime.sessions[sessionId].messageOrder, ['image']); assertImage(runtime)
  }
})

test('page prepending, duplicate replay and hydration do not duplicate or discard the sticker', () => {
  let runtime = reduce(state.initialRuntimeState, hydrate(client.projectMessageEvents(events.slice(2))))
  runtime = reduce(runtime, state.prependSessionMessages(sessionId, { items: client.projectMessageEvents(events.slice(0, 3)), hasMore: false }))
  runtime = live([events[2], events[2]], runtime)
  assert.deepEqual(runtime.sessions[sessionId].messageOrder, ['user', 'tool', 'image', 'final']); assertImage(runtime)
  const projected = client.projectMessageEvents([events[2], events[2]])
  assert.equal(projected.length, 1)
})

test('interleaved actors own distinct stable sticker messages and never borrow another actor stream', () => {
  const one = sticker('one', 1, 1), two = sticker('two', 2, 2)
  const runtime = live([one, two])
  for (const [id, actor] of [['one', 1], ['two', 2]]) {
    assertImage(runtime, id)
    assert.equal(runtime.sessions[sessionId].messages[id].speaker.assistantID, actor)
  }
  assert.deepEqual(client.projectMessageEvents([one, two]).map(value => value.info.id), ['one', 'two'])
})

test('deleted stickers stay absent after both history reload and delayed live events', () => {
  let runtime = live(events)
  runtime = reduce(runtime, state.applyRuntimeEvent({ type: 'message.removed', properties: { sessionID: sessionId, messageID: 'image', deleted: true } }))
  runtime = reduce(runtime, hydrate(client.projectMessageEvents(events)))
  runtime = live([events[2]], runtime)
  assert.equal(runtime.sessions[sessionId].messages.image, undefined)
  assert.ok(!runtime.sessions[sessionId].messageOrder.includes('image'))
})

test('model retry cleanup never removes an already sent independent sticker', () => {
  const retry = event('retry', 'agent.retry_scheduled', { operation: 'model' }, 5)
  const projected = client.projectMessageEvents([...events, retry])
  assert.ok(projected.some(value => value.info.id === 'image'))
})
