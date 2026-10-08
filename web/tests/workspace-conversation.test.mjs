import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkspaceConversation } from '../src/components/layout/create-workspace-conversation.ts'

function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function fixture() {
  const state = { revision: 1, sessionId: undefined, mounted: true }
  const calls = []
  const access = {
    current: () => ({ ...state }),
    create: async () => { calls.push('create'); return { id: 'new-session' } },
    selected: id => { calls.push(['selected', id]); state.sessionId = id },
    choose: async () => { calls.push('picker'); return 'E:/chosen-project' },
    bind: async (id, path) => calls.push(['bind', id, path]),
    changed: () => calls.push('changed'), error: message => calls.push(['error', message]),
  }
  return { state, calls, access }
}

test('explicit new conversation selects its own tab then binds only its user-chosen directory', async () => {
  const f = fixture()
  await createWorkspaceConversation(f.access)
  assert.deepEqual(f.calls, ['create', ['selected', 'new-session'], 'picker', ['bind', 'new-session', 'E:/chosen-project'], 'changed'])
})

test('cancelled folder picker leaves an empty selected conversation and performs no bind or model action', async () => {
  const f = fixture(); f.access.choose = async () => null
  await createWorkspaceConversation(f.access)
  assert.equal(f.state.sessionId, 'new-session')
  assert.deepEqual(f.calls, ['create', ['selected', 'new-session']])
})

test('late session creation after another tab or account is selected cannot open a picker or steal selection', async () => {
  for (const change of [state => { state.sessionId = 'other' }, state => { state.revision++ }]) {
    const f = fixture(), created = deferred()
    f.access.create = () => created.promise
    const pending = createWorkspaceConversation(f.access)
    change(f.state); created.resolve({ id: 'late-session' }); await pending
    assert.deepEqual(f.calls, [])
  }
})

test('automatic hydration selecting the newly created session is allowed, but a later unrelated tab invalidates its picker', async () => {
  const f = fixture(), picker = deferred()
  f.access.create = async () => { f.state.sessionId = 'new-session'; return { id: 'new-session' } }
  f.access.choose = () => picker.promise
  const pending = createWorkspaceConversation(f.access)
  await Promise.resolve(); await Promise.resolve()
  assert.equal(f.state.sessionId, 'new-session')
  f.state.sessionId = 'other-session'
  picker.resolve('E:/must-not-bind'); await pending
  assert.deepEqual(f.calls, [['selected', 'new-session']])
})

test('returning to a fresh draft after creating the conversation cannot apply its old folder picker', async () => {
  const f = fixture(), picker = deferred()
  f.access.choose = () => picker.promise
  const pending = createWorkspaceConversation(f.access)
  await Promise.resolve(); await Promise.resolve()
  f.state.sessionId = undefined
  picker.resolve('E:/stale-choice'); await pending
  assert.deepEqual(f.calls, ['create', ['selected', 'new-session']])
})
