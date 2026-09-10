import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
const vite = await createServer({ server:{middlewareMode:true,hmr:false},appType:'custom' })
const { runtimeReducer, initialRuntimeState, setConnectionState, setConnectionError } = await vite.ssrLoadModule('/src/lib/session-reducer.ts')
after(() => vite.close())
test('business rejection preserves an established transport connection', () => {
  const connected = runtimeReducer(initialRuntimeState,setConnectionState('connected'))
  const rejected = runtimeReducer(connected,setConnectionError('Wait for the session to become idle before configuration'))
  assert.equal(rejected.connectionState,'connected')
  assert.match(rejected.connectionError,/idle/)
})
test('transport disconnect and reconnect still update connection state and clear old errors', () => {
  let state = runtimeReducer(initialRuntimeState,setConnectionState('disconnected'))
  state = runtimeReducer(state,setConnectionError('RPC connection closed'))
  assert.equal(state.connectionState,'disconnected')
  state = runtimeReducer(state,setConnectionState('connected'))
  assert.equal(state.connectionError,undefined)
})
