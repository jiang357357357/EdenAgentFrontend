import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../src/lib/runtime-model-client.ts', import.meta.url))
const fixture = { origin: 'mon', token: 'fixture-account', calls: [], request: null }
globalThis.edenModelReadFixture = fixture
const { outputFiles } = await build({
  entryPoints: [source], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'model-read-fixture', setup(builder) {
    builder.onResolve({ filter: /^\.\/(auth|runtime-origin|rpc-transport)$/ }, args => args.importer === source ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === './auth'
      ? "export const getStoredToken=()=>globalThis.edenModelReadFixture.token;export const resolveCoreBaseUrl=async()=> 'http://fixture.local';"
      : args.path === './runtime-origin' ? "export const getStoredRuntimeOrigin=()=>globalThis.edenModelReadFixture.origin;"
      : "export const rpcRequestForOrigin=async(origin,method,params)=>{const f=globalThis.edenModelReadFixture;f.calls.push({origin,method,params});return f.request(method,params)};", loader: 'js' }))
  } }],
})
const { getRuntimeModelConfig, updateRuntimeModel } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const busy = () => new Error('Wait for the session to become idle before configuration')
const bound = { id: 'deepseek-chat', provider: 'deepseek', label: 'DeepSeek 测试', aiEntityId: 42, source: 'core', available: true, contextWindow: 128000 }
beforeEach(() => { fixture.origin = 'mon'; fixture.token = 'fixture-account'; fixture.calls = []; fixture.request = null })

test('busy sessions display the server-bound model through its read-only endpoint', async () => {
  fixture.request = async method => { if (method === 'model.catalog') throw busy(); assert.equal(method, 'model.read'); return bound }
  const config = await getRuntimeModelConfig('session')
  assert.equal(config.current.label, 'DeepSeek 测试')
  assert.equal(config.current.modelID, 'deepseek-chat')
  assert.equal(config.current.contextWindow, 128000)
  assert.equal(config.readOnly, true)
  assert.deepEqual(fixture.calls.map(call => call.method), ['model.catalog', 'model.read'])
  assert.deepEqual(fixture.calls[1].params, { sessionId: 'session' })
})

test('authentication, ownership and other failures are not replaced by a model fallback', async () => {
  for (const message of ['Unauthorized', 'Session is not owned by this account', 'Core unavailable']) {
    fixture.calls = []
    fixture.request = async () => { throw new Error(message) }
    await assert.rejects(getRuntimeModelConfig('session'), error => error.message === message)
    assert.equal(fixture.calls.length, 1)
  }
})

test('account or world changes cannot display a binding from a stale request', async () => {
  fixture.request = async method => { if (method === 'model.catalog') throw busy(); fixture.token = 'other-account'; return bound }
  await assert.rejects(getRuntimeModelConfig('session'), /Core account changed/)
  fixture.token = 'fixture-account'
  fixture.request = async () => { fixture.origin = 'local'; throw busy() }
  await assert.rejects(getRuntimeModelConfig('session'), /World changed/)
  assert.equal(fixture.calls.at(-1).method, 'model.catalog')
})

test('busy model selection still fails and never turns into a read', async () => {
  fixture.request = async method => { assert.equal(method, 'model.select'); throw busy() }
  await assert.rejects(updateRuntimeModel(43, 'session'), /become idle/)
  assert.deepEqual(fixture.calls.map(call => call.method), ['model.select'])
})
