import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { HISTORY_CACHE_LIMITS, historyBytes, pruneSessionHistories, shouldRestoreRecentHistory } from '../src/lib/session-history-cache.ts'
import { sessionListLayout, visibleSessionRows } from '../src/lib/session-list-layout.ts'

const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const { initialRuntimeState, runtimeReducer, hydrateSessionMessages, setActiveSession, applyRuntimeEvent } = await vite.ssrLoadModule('/src/lib/session-reducer.ts')
const { createSessionSummarySelector } = await vite.ssrLoadModule('/src/lib/session-summary-selector.ts')
const { selectActiveSession } = await vite.ssrLoadModule('/src/lib/session-selectors.ts')

function session(id, overrides = {}) {
  const message = { id: `${id}-message`, role: 'assistant', sessionID: id, completedAt: 2, createdAt: 1,
    partOrder: ['text'], parts: { text: { id: 'text', type: 'text', text: 'fixture', done: true } } }
  return { id, title: id, status: 'idle', hydrated: true, hasMoreMessages: true, loadingOlderMessages: false,
    messageCursor: 'cursor', historyLastUsed: Date.now(), messageOrder: [message.id], messages: { [message.id]: message }, ...overrides }
}
function stateWith(...sessions) {
  return { ...initialRuntimeState, activeSessionId: sessions[0]?.id, sessionOrder: sessions.map(item => item.id),
    sessions: Object.fromEntries(sessions.map(item => [item.id, item])) }
}
function page(id, prefix, count = 50) {
  return { items: Array.from({ length: count }, (_, index) => ({
    info: { id: `${prefix}-${index}`, sessionID: id, role: 'assistant', time: { created: index + 1, completed: index + 2 } },
    parts: [{ id: `part-${index}`, type: 'text', text: `${prefix} ${index}`, time: { start: 1, end: 2 } }],
  })), hasMore: true, nextCursor: `${prefix}-cursor` }
}

test('inactive LRU payloads are bounded while all session identities and bindings remain', () => {
  const sessions = Array.from({ length: 12 }, (_, index) => session(String(index), { historyLastUsed: Date.now() - index * 1000,
    participants: [{ assistantID: index, assistantName: `assistant ${index}` }] }))
  const source = stateWith(...sessions), next = pruneSessionHistories(source)
  assert.equal(Object.values(next.sessions).filter(item => item.messageOrder.length).length, 5)
  assert.equal(Object.keys(next.sessions).length, 12)
  assert.equal(next.sessions['0'], source.sessions['0'])
  assert.equal(next.sessions['11'].hydrated, false)
  assert.equal(next.sessions['11'].messageCursor, undefined)
  assert.equal(next.sessions['11'].participants, source.sessions['11'].participants)
  assert.equal(source.sessions['11'].messageOrder.length, 1, 'the previous reducer snapshot is unchanged')
})

test('busy, stopping, pending approvals/questions, local messages, loads and children are protected', () => {
  const local = session('local')
  local.messages['local-message'].localOnly = true
  local.messages['local-message'].deliveryState = 'failed'
  const state = stateWith(session('active'), session('busy', { status: 'busy' }), session('retry', { status: 'retry' }),
    session('stopping', { status: 'stopping' }), local, session('permission'), session('question'),
    session('loading', { loadingOlderMessages: true }), session('child', { agentThreads: [{ status: 'running' }] }),
    ...Array.from({ length: 10 }, (_, index) => session(`idle-${index}`)))
  state.permissions = { request: { id: 'request', sessionID: 'permission' } }
  state.questions = { question: { id: 'question', sessionID: 'question' } }
  const next = pruneSessionHistories(state)
  for (const id of ['active', 'busy', 'retry', 'stopping', 'local', 'permission', 'question', 'loading', 'child'])
    assert.equal(next.sessions[id], state.sessions[id], id)
  assert.equal(Object.values(next.sessions).filter(item => item.messageOrder.length).length, 13)
})

test('oversized and expired inactive payloads release, with the active snapshot preserved', () => {
  const oversized = session('large')
  oversized.messages['large-message'].parts.text.text = 'x'.repeat(HISTORY_CACHE_LIMITS.inactiveSessionBytes / 2)
  assert.ok(historyBytes(oversized) > HISTORY_CACHE_LIMITS.inactiveSessionBytes)
  const expired = session('expired', { historyLastUsed: Date.now() - HISTORY_CACHE_LIMITS.idleMs - 1 })
  const state = stateWith(session('active'), oversized, expired)
  const next = pruneSessionHistories(state)
  assert.equal(next.sessions.large.messageOrder.length, 0)
  assert.equal(next.sessions.expired.messageOrder.length, 0)
  assert.equal(next.sessions.active, state.sessions.active)
  assert.equal(pruneSessionHistories(next), next, 'no maintenance render when nothing changes')
})

test('leaving browsed history releases it; returning reloads a valid recent page and supports older pages', () => {
  let state = stateWith(session('history', { historyBrowsing: true }), session('other'))
  state = runtimeReducer(state, setActiveSession('other'))
  assert.equal(state.sessions.history.messageOrder.length, 0)
  assert.equal(state.sessions.history.hydrated, false)
  state = runtimeReducer(state, setActiveSession('history'))
  assert.equal(selectActiveSession(state).historyReady, false)
  state = runtimeReducer(state, hydrateSessionMessages('history', page('history', 'recent')))
  assert.equal(selectActiveSession(state).historyReady, true)
  assert.equal(selectActiveSession(state).messages.length, 50)
  assert.equal(state.sessions.history.messageCursor, 'recent-cursor')
  assert.equal(state.sessions.history.hasMoreMessages, true)
  state = runtimeReducer(state, { type: 'prependMessages', sessionID: 'history', messages: page('history', 'older').items,
    hasMore: true, nextCursor: 'older-cursor' })
  assert.equal(selectActiveSession(state).messages.length, 100)
  assert.equal(state.sessions.history.messageCursor, 'older-cursor')
  assert.equal(state.sessions.history.historyBrowsing, true)
})

test('recent restore waits for history reading and the active turn, and retains failed local messages', () => {
  const current = session('active')
  current.messageOrder = Array.from({ length: 201 }, (_, index) => String(index))
  assert.equal(shouldRestoreRecentHistory(current), true)
  assert.equal(shouldRestoreRecentHistory({ ...current, historyBrowsing: true }), false)
  assert.equal(shouldRestoreRecentHistory({ ...current, status: 'busy' }), false)
  assert.equal(shouldRestoreRecentHistory({ ...current, hydrated: false }), false)
  assert.equal(shouldRestoreRecentHistory({ ...current, loadingOlderMessages: true }), false)
  current.messages['active-message'].localOnly = true
  assert.equal(shouldRestoreRecentHistory(current), false)
})

test('recent restore preserves pending approvals and questions until they are resolved', () => {
  const current = session('active')
  current.messageOrder = Array.from({ length: 201 }, (_, index) => String(index))
  const source = stateWith(current)
  assert.equal(shouldRestoreRecentHistory(current, source), true)
  assert.equal(shouldRestoreRecentHistory(current, { ...source, permissions: { pending: { sessionID: 'active' } } }), false)
  assert.equal(shouldRestoreRecentHistory(current, { ...source, questions: { pending: { sessionID: 'active' } } }), false)
  assert.equal(shouldRestoreRecentHistory(current, { ...source, questions: { pending: { sessionID: 'other' } } }), true)
})

test('an offscreen page update is not treated as user navigation away from history', () => {
  const source = { ...stateWith(session('history')), activeSessionId: undefined }
  const next = runtimeReducer(source, { type: 'prependMessages', sessionID: 'history',
    messages: page('history', 'older', 2).items, hasMore: true, nextCursor: 'older-cursor' })
  assert.equal(next.sessions.history.messageOrder.length, 3)
  assert.equal(next.sessions.history.hydrated, true)
  assert.equal(next.sessions.history.historyBrowsing, true)
})

test('stream deltas preserve list identity without exposing or retaining message payloads', () => {
  const summarize = createSessionSummarySelector()
  let state = stateWith(session('active'), session('other'))
  const before = summarize(state)
  assert.equal(before[0].messages.length, 0)
  state = runtimeReducer(state, applyRuntimeEvent({ type: 'message.part.delta', properties: {
    sessionID: 'active', messageID: 'active-message', partID: 'text', field: 'text', delta: 'update' } }))
  assert.equal(summarize(state), before)
  state = { ...state, sessions: { ...state.sessions, active: { ...state.sessions.active, title: 'renamed' } } }
  const after = summarize(state)
  assert.notEqual(after, before)
  assert.equal(after[1], before[1])
  assert.equal(after[0].title, 'renamed')
})

test('list projection does not read history, and a fresh selector never reuses another account', () => {
  const item = session('active')
  Object.defineProperty(item, 'messages', { get() { throw new Error('list must not inspect messages') } })
  const state = stateWith(item)
  const first = createSessionSummarySelector()(state), second = createSessionSummarySelector()(state)
  assert.equal(first[0].messages.length, 0)
  assert.notEqual(first[0], second[0])
})

test('virtual row ranges remain bounded at either end and retain date groups', () => {
  const sessions = Array.from({ length: 10_000 }, (_, index) => ({ id: String(index), title: String(index), updatedAt: 0 }))
  const layout = sessionListLayout(sessions, 800)
  assert.equal(layout.rows.length, 10_001)
  assert.equal(layout.rows[0].label, '更早')
  const top = visibleSessionRows(layout.rows, 0, 600)
  const bottom = visibleSessionRows(layout.rows, layout.height - 600, 600)
  assert.ok(top.length <= 21)
  assert.ok(bottom.length <= 21)
  assert.equal(bottom.at(-1).session.id, '9999')
  assert.equal(bottom.at(-1).position, 10_000)
})
