import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const bundled = await build({ entryPoints: [fileURLToPath(new URL('../src/lib/plugin-ui-host.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'isolated-rpc', setup(builder) {
    builder.onResolve({ filter: /\/rpc-transport$/ }, () => ({ path: 'rpc', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const rpcRequestForOrigin=(...args)=>globalThis.__pluginHostRpc(...args);
      export const observeSessionEvents=(listener)=>globalThis.__pluginObserve?.(listener) ?? (()=>{});
      export const openPluginSessionChannel=()=>globalThis.__pluginOpen?.() ?? (()=>{});
      export const subscribeSessionChannelStatus=(listener)=>globalThis.__pluginStatus?.(listener) ?? (()=>{});` }))
  } }] })
const { createPluginUiHost } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))

function fixture(t) {
  const calls = [], operations = [], module = new AbortController()
  let resolveCall
  const pending = new Promise(resolve => { resolveCall = resolve })
  const previous = globalThis.__pluginHostRpc
  globalThis.__pluginHostRpc = async (_origin, method, input) => {
    calls.push({ method, input })
    if (method === 'plugin.ui.call') return pending
    if (method === 'plugin.ui.operation') return { state: 'waiting' }
    return { cancelled: true }
  }
  const binding = createPluginUiHost({ module: { pluginId: 'memo', componentId: 'main', revision: 'a'.repeat(64), document: { capabilities: { tools: ['read_connector_events'] } } },
    view: { id: 'main' }, signal: module.signal }, 'local', 'f95caf59-e85a-4dd1-bcfa-702e5b9df373', {
      setDirty() {}, registerSave() { return () => {} }, onOperations: items => operations.push(structuredClone(items)),
    })
  t.after(() => { binding.close(); if (previous === undefined) delete globalThis.__pluginHostRpc; else globalThis.__pluginHostRpc = previous })
  return { ...binding, calls, operations, module, resolve: resolveCall }
}

test('instance close cancels server work and settles the SDK promise without waiting for a transport timeout', async t => {
  const f = fixture(t), pending = f.host.callTool('create_memo', { title: 'fixture' })
  const rejected = assert.rejects(pending, /abort|cancel/i)
  f.close()
  await rejected
  assert.equal(f.calls.filter(call => call.method === 'plugin.ui.call').length, 1)
  assert.equal(f.calls.filter(call => call.method === 'plugin.ui.cancel').length, 1)
  f.resolve({ id: 1 })
})

test('connector event subscription filters sessions, deduplicates and resyncs after reconnect or sharing', t => {
  let emit, status, cleaned = 0
  globalThis.__pluginObserve = listener => { emit = listener; return () => { cleaned++ } }
  globalThis.__pluginStatus = listener => { status = listener; return () => { cleaned++ } }
  globalThis.__pluginOpen = () => () => { cleaned++ }
  t.after(() => { delete globalThis.__pluginObserve; delete globalThis.__pluginStatus; delete globalThis.__pluginOpen })
  const f = fixture(t), events = [], sessionId = f.host.sessionId
  const unsubscribe = f.host.onConnectorEvent(event => events.push(event))
  const payload = { connectorId: 'connector', eventId: 'event-1', eventType: 'changed' }
  emit({ sessionId: 'other', eventType: 'connector.event', payload })
  emit({ sessionId, eventType: 'connector.event', payload })
  emit({ sessionId, eventType: 'connector.event', payload })
  emit({ sessionId, eventType: 'connector.sharing', payload: {} })
  status({ sessionId, connected: true })
  assert.deepEqual(events, [{ type: 'event', ...payload }, { type: 'resync' }, { type: 'resync' }])
  unsubscribe(); unsubscribe()
  assert.equal(cleaned, 3)
})

test('per-call cancellation keeps the instance alive and does not resubmit the write', async t => {
  const f = fixture(t), abort = new AbortController()
  const pending = f.host.callTool('create_memo', { title: 'fixture' }, { signal: abort.signal })
  const rejected = assert.rejects(pending, /abort|cancel/i)
  abort.abort(); await rejected
  assert.equal(f.host.signal.aborted, false)
  assert.equal(f.calls.filter(call => call.method === 'plugin.ui.call').length, 1)
  assert.equal(f.calls.filter(call => call.method === 'plugin.ui.cancel').length, 1)
  f.resolve({ id: 1 })
  assert.deepEqual(await f.host.readSession(), { id: 1 })
})

test('waiting status is observable and the host cancel action only cancels that operation', async t => {
  const f = fixture(t), pending = f.host.callTool('list_memos_page', { limit: 20 })
  const rejected = assert.rejects(pending, /abort|cancel|取消/i)
  await new Promise(resolve => setTimeout(resolve, 300))
  const operation = f.operations.at(-1)[0]
  assert.equal(operation.state, 'waiting')
  f.cancel(operation.id); await rejected
  assert.equal(f.host.signal.aborted, false)
  f.resolve({ items: [], nextCursor: null, hasMore: false })
})

test('module unload cancels pending work', async t => {
  const f = fixture(t), pending = f.host.callTool('list_memos_page', { limit: 20 })
  const rejected = assert.rejects(pending, /abort|cancel/i)
  f.module.abort(); await rejected
  assert.equal(f.host.signal.aborted, true)
  f.resolve({ items: [], nextCursor: null, hasMore: false })
})

test('successful responses are returned without a cancellation RPC or a retry', async t => {
  const f = fixture(t), pending = f.host.callTool('list_memos_page', { limit: 20 })
  const value = { items: [{ id: 1, title: 'saved' }], nextCursor: null, hasMore: false }
  f.resolve(value)
  assert.deepEqual(await pending, value)
  assert.equal(f.calls.length, 1)
})
