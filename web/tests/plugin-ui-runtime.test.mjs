import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { pluginUiModuleSchema } from '@eden/api'

const vite = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
  optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
after(() => vite.close())
const { PluginUiRuntime } = await vite.ssrLoadModule('/src/lib/plugin-ui-runtime.ts')
const descriptor = (source = 'v1', revision = 'a'.repeat(64)) => ({ pluginId: 'widget', pluginName: '我的工具', componentId: 'main', revision,
  sha256: createHash('sha256').update(source).digest('hex'), document: { schemaVersion: 1, type: 'module', apiVersion: 1, entry: 'client.js',
    views: [{ id: 'main', slot: 'page', title: '我的页面', toolNames: [] }], capabilities: { sessionRead: false, sessionSend: false, tools: [] } } })

test('legacy sources are deferred to isolated documents, and replacement revokes old views', async () => {
  let loads = 0
  const source = 'globalThis.__legacyMainThreadExecuted = true; throw Error("must not run in workbench");'
  const runtime = new PluginUiRuntime(async item => { loads++; return { ...item, source } })
  await runtime.sync([descriptor(source)])
  const first = runtime.getSnapshot().views[0]
  assert.equal(first.legacySource, source)
  assert.equal(globalThis.__legacyMainThreadExecuted, undefined)
  await runtime.sync([descriptor(source)])
  assert.equal(loads, 1)
  await runtime.sync([descriptor(source, 'b'.repeat(64))])
  assert.equal(first.signal.aborted, true)
  assert.equal(loads, 2)
  await runtime.sync([])
  assert.equal(runtime.getSnapshot().views.length, 0)
})

test('integrity failures never register a view and polling does not repeatedly reload failures', async () => {
  let reads = 0
  const runtime = new PluginUiRuntime(async item => { reads++; return { ...item, source: reads === 1 ? 'modified' : 'v1' } })
  await runtime.sync([descriptor()]); await runtime.sync([descriptor()])
  assert.equal(reads, 1)
  assert.equal(runtime.getSnapshot().views.length, 0)
  assert.match(runtime.getSnapshot().errors.join(), /完整性/)
  runtime.retryFailed(); await runtime.sync([descriptor()])
  assert.equal(reads, 2)
  assert.equal(runtime.getSnapshot().views.length, 1)
  runtime.close()
})

test('configuration changes notify the existing worker and refresh settings without reloading code', async () => {
  let reads = 0
  const module = pluginUiModuleSchema.parse({ ...descriptor(), document: {schemaVersion:1,type:'module',apiVersion:2,entry:'extension.js',views:[],
    contributes:{configuration:{enabled:{type:'boolean',title:'Enabled',default:false}}}}, configurationRevision:0 })
  const runtime = new PluginUiRuntime(async item => { reads++; return {...item,source:'v1'} })
  await runtime.sync([module])
  const worker = runtime.getSnapshot().extensions[0].controller, events = []
  worker.configurationChanged = keys => events.push(keys)
  let updates = 0
  const stop = runtime.subscribe(() => updates++)
  await runtime.sync([{...module,configurationRevision:1}])
  assert.deepEqual(events, [['enabled']]); assert.equal(reads,1); assert.equal(updates,1)
  assert.equal(runtime.getSnapshot().extensions[0].controller,worker)
  await runtime.sync([{...module,configurationRevision:1}]); assert.equal(events.length,1)
  stop(); runtime.close()
})

test('late loads cannot reactivate an unmounted world, and development effect replay can reopen the runtime', async () => {
  let finish
  const waiting = new Promise(resolve => { finish = resolve })
  const runtime = new PluginUiRuntime(async item => { await waiting; return { ...item, source: 'v1' } })
  const first = runtime.sync([descriptor()]); runtime.close(); finish(); await first
  assert.equal(runtime.getSnapshot().views.length, 0)
  runtime.open(); await runtime.sync([descriptor()])
  assert.equal(runtime.getSnapshot().views.length, 1)
  runtime.close()
})
