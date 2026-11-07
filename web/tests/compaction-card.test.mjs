import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
const vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const transport = await vite.ssrLoadModule('/src/lib/rpc-transport.ts')
const client = await vite.ssrLoadModule('/src/lib/agent-client.ts')
const reducer = await vite.ssrLoadModule('/src/lib/session-reducer.ts')
const selectors = await vite.ssrLoadModule('/src/lib/session-selectors.ts')
const grouping = await vite.ssrLoadModule('/src/lib/message-grouping.ts')
const timing = await vite.ssrLoadModule('/src/lib/turn-timing.ts')
const cache = await vite.ssrLoadModule('/src/lib/session-view-cache.ts')
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

test('compaction progress updates one card and replays its latest durable cursor', () => {
  const first = { ...event, id: 'progress-1', eventType: 'agent.compaction_progress', payload: { processed: 2, total: 40, resumed: false } }
  const next = { ...first, id: 'progress-2', seq: 2n, payload: { processed: 33, total: 40, resumed: true } }
  const replay = client.projectMessageEvents([first, next])
  assert.equal(replay.length, 1)
  assert.match(replay[0].parts[0].summary, /33\/40/)
  assert.match(replay[0].parts[0].summary, /恢复上次进度/)
  assert.equal(replay[0].parts[0].progress.complete, false)
  const live = client.createSessionEventProjector()(next)
  assert.equal(live.find(item => item.type === 'message.updated').properties.info.id, replay[0].info.id)
})

test('paused compaction keeps its saved-work notice without leaking the provider failure', () => {
  const failure = { ...event, eventType: 'agent.auto_compaction_failed', payload: { message: 'private provider details' } }
  const result = transport.apiMessage(failure)
  assert.equal(result.parts[0].progress.paused, true)
  assert.match(result.parts[0].summary, /已保存/)
  assert.doesNotMatch(JSON.stringify(result), /private provider details/)
})

function progress(seq, processed = 0, extra = {}) {
  return { ...event, id: `progress-${seq}`, seq: BigInt(seq), createdAt: BigInt(seq), eventType: 'agent.compaction_progress',
    payload: { processed, total: 327, resumed: false }, ...extra }
}
function result(seq, extra = {}) {
  return { ...event, id: `result-${seq}`, seq: BigInt(seq), createdAt: BigInt(seq),
    payload: { automatic: true, tokensAfter: 22018, compactionEntry: { id: `entry-${seq}`, summary: '保留当前任务与已完成工作', tokensBefore: 232846 } }, ...extra }
}
function apply(state, events) {
  const project = client.createSessionEventProjector()
  for (const source of events) for (const update of project(source)) state = reducer.runtimeReducer(state, reducer.applyRuntimeEvent(update))
  return state
}
function replay(events) {
  return reducer.runtimeReducer(reducer.initialRuntimeState, reducer.hydrateSessionMessages('session', {
    items: client.projectMessageEvents(events), hasMore: false,
  }))
}
const views = state => selectors.selectSessions(state).find(session => session.id === 'session').messages
const cards = state => views(state).flatMap(message => message.metaParts ?? [])

test('progress survives the real reducer and is never rendered as an already completed compaction', () => {
  const state = apply(reducer.initialRuntimeState, [progress(1, 12)])
  const [card] = cards(state)
  assert.equal(card.compactionProgress, true)
  assert.equal(card.title, '正在整理历史')
  assert.match(card.summary, /12\/327/)
  assert.deepEqual(Object.values(state.sessions.session.messages)[0].parts['compaction-progress:session:turn:status'].progress,
    { paused: false, complete: false })
  const pending = cards(apply(state, [progress(2, 327)]))[0]
  assert.equal(pending.compactionProgress, true)
  assert.equal(pending.title, '正在完成压缩')
})

test('final result replaces progress in live rendering and history replay without deleting durable messages', () => {
  const events = [progress(1), progress(2, 327), result(3)]
  for (const state of [apply(reducer.initialRuntimeState, events), replay(events)]) {
    assert.equal(cards(state).length, 1)
    const [card] = cards(state)
    assert.equal(card.compactionProgress, undefined)
    assert.equal(card.title, '自动压缩上下文')
    assert.equal(card.contextTokensBefore, 232846)
    assert.equal(card.contextTokensAfter, 22018)
    assert.equal(card.detail, '保留当前任务与已完成工作')
    assert.equal(Object.keys(state.sessions.session.messages).length, 2)
  }
})

test('paused work stays visible, and retry completion replaces its paused card', () => {
  const failure = { ...progress(2), eventType: 'agent.auto_compaction_failed', payload: { message: 'private provider details' } }
  const state = apply(reducer.initialRuntimeState, [progress(1), failure])
  assert.equal(cards(state).length, 1)
  assert.equal(cards(state)[0].title, '历史整理已暂停')
  assert.equal(cards(state)[0].tone, 'warning')
  assert.doesNotMatch(JSON.stringify(cards(state)), /private provider details/)
  assert.equal(cards(apply(state, [progress(3, 30), result(4)]))[0].title, '自动压缩上下文')
})

test('a later compaction in the same turn remains visible and preserves both completed results', () => {
  // Identical timestamps prove that ordering uses the durable sequence, not wall-clock rounding.
  const first = result(2, { createdAt: 1n }), next = progress(3, 2, { createdAt: 1n })
  let state = apply(reducer.initialRuntimeState, [progress(1), first, next])
  assert.equal(cards(state).filter(card => card.compactionProgress).length, 1)
  assert.equal(cards(state).filter(card => !card.compactionProgress).length, 1)
  assert.deepEqual(views(state).map(message => message.id), ['compaction:result-2', 'compaction-progress:session:turn'])
  state = apply(state, [result(4, { createdAt: 1n })])
  assert.equal(cards(state).length, 2)
  assert.equal(cards(state).some(card => card.compactionProgress), false)
})

test('older progress loaded across a history-page boundary stays hidden, while another turn is unaffected', () => {
  let state = replay([result(4)])
  state = reducer.runtimeReducer(state, reducer.prependSessionMessages('session', { items: client.projectMessageEvents([progress(1)]), hasMore: false }))
  assert.equal(cards(state).length, 1)
  state = apply(state, [progress(5, 1, { turnId: 'different-turn' })])
  assert.equal(cards(state).length, 2)
  assert.equal(cards(state).filter(card => card.compactionProgress).length, 1)
})

test('progress is separated from assistant reply groups and never owns the reply duration', () => {
  const state = apply(reducer.initialRuntimeState, [progress(1)])
  const [view] = views(state)
  assert.equal(grouping.messagesShareAssistantGroup({ id: 'reply', role: 'assistant' }, view), false)
  const runtimeProgress = Object.values(state.sessions.session.messages)[0]
  const reply = { ...runtimeProgress, id: 'reply', role: 'assistant', turnID: 'turn', turnTiming: { startedAt: 1, completedAt: 2001 } }
  const durations = timing.replyDurations([reply, runtimeProgress])
  assert.equal(durations.get('reply'), 2000)
  assert.equal(durations.has(runtimeProgress.id), false)
})

test('a hot-updated projection replaces cached duplicate cards without mutating stored session history', () => {
  const state = replay([progress(1), result(2)])
  const session = state.sessions.session, message = session.messages['compaction:result-2']
  cache.cachedSessionView(session, () => ({ id: 'session', messages: [{ id: 'stale-progress' }, { id: 'stale-result' }] }))
  cache.cachedMessageView(message, false, undefined, () => ({ id: message.id, role: 'assistant', metaParts: [{ type: 'compaction', title: 'stale' }] }))
  assert.equal(cards(state).length, 1)
  assert.equal(cards(state)[0].title, '自动压缩上下文')
  assert.equal(cards(state)[0].contextTokensAfter, 22018)
  assert.equal(Object.keys(session.messages).length, 2)
})

test('state retained from the older client cannot turn a progress card into a completed result', () => {
  let state = apply(reducer.initialRuntimeState, [progress(1)])
  const part = Object.values(Object.values(state.sessions.session.messages)[0].parts)[0]
  delete part.progress
  delete part.eventSequence
  assert.equal(cards(state)[0].compactionProgress, true)
  assert.equal(cards(state)[0].title, '正在整理历史')
  state = apply(state, [result(2)])
  assert.equal(cards(state).length, 1)
  assert.equal(cards(state)[0].contextTokensAfter, 22018)
})
