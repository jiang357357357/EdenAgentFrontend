import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { apiSession } = await vite.ssrLoadModule('/src/lib/rpc-transport.ts')
const { initialRuntimeState, runtimeReducer, hydrateSessionList, setSessionStatus } =
  await vite.ssrLoadModule('/src/lib/session-reducer.ts')
after(() => vite.close())

const session = executionStatus => apiSession({
  id: '00000000-0000-4000-8000-000000000001', title: 'Stopping', titleSource: 'user',
  status: 'active', executionStatus, runtimeOrigin: 'local', participants: [], environment: null,
  createdAt: 1, updatedAt: 1,
})

test('list refresh keeps a stop request visible until the backend reports idle', () => {
  const id = session('busy').id
  let state = runtimeReducer(initialRuntimeState, hydrateSessionList([session('busy')]))
  assert.equal(state.sessions[id].status, 'busy')

  state = runtimeReducer(state, setSessionStatus(id, 'stopping'))
  state = runtimeReducer(state, hydrateSessionList([session('busy')]))
  assert.equal(state.sessions[id].status, 'stopping')

  state = runtimeReducer(state, hydrateSessionList([session('idle')]))
  assert.equal(state.sessions[id].status, 'idle')
})
