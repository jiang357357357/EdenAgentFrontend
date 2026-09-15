import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(() => vite.close())
const transport = await vite.ssrLoadModule('/src/lib/rpc-transport.ts')
const client = await vite.ssrLoadModule('/src/lib/agent-client.ts')
const event = { id: 'compact-result', sessionId: 'session', turnId: 'turn', seq: 1n, createdAt: 1n,
  eventType: 'agent.session_compact', payload: { compactionEntry: { id: 'entry', summary: '只有一句你好也允许压缩', tokensBefore: 30, retainedTail: [] } } }
test('compaction is projected as the same expandable message during live updates and replay', () => {
  const live = client.createSessionEventProjector()(event)
  const replay = client.projectMessageEvents([event])
  assert.equal(replay.length, 1)
  assert.equal(live.find(e => e.type === 'message.updated').properties.info.id, replay[0].info.id)
  const part = live.find(e => e.type === 'message.part.updated').properties.part
  assert.deepEqual(part, replay[0].parts[0])
  assert.equal(part.type, 'compaction')
  assert.equal(part.summary, '只有一句你好也允许压缩')
  assert.equal(part.tokensAfter, undefined)
})
test('malformed compaction does not fabricate a completed card', () => {
  assert.equal(transport.apiMessage({ ...event, payload: {} }), undefined)
  assert.deepEqual(transport.projectSessionEvent({ ...event, payload: {} }), [])
})

test('accepted slash command and result render in order during live updates and history replay', () => {
  const command = { ...event, id: 'command-event', eventType: 'input.queued', payload: { kind: 'compact', text: '保留任务要求' } }
  const replay = client.projectMessageEvents([command, event])
  assert.deepEqual(replay.map(m => m.info.role), ['user', 'assistant'])
  assert.equal(replay[0].parts[0].text, '/compact 保留任务要求')
  const live = client.createSessionEventProjector()(command)
  assert.equal(live.find(e => e.type === 'message.part.updated').properties.part.text, '/compact 保留任务要求')
  assert.deepEqual(transport.projectSessionEvent({ ...command, payload: { kind: 'prompt', text: 'hello' } }), [])
})

test('automatic compaction keeps automatic origin and comparable host estimates', () => {
  const automatic = { ...event, payload: { ...event.payload, automatic: true, tokensAfter: 12 } }
  const part = transport.apiMessage(automatic).parts[0]
  assert.equal(part.auto, true)
  assert.equal(part.tokensBefore, 30)
  assert.equal(part.tokensAfter, 12)
})
