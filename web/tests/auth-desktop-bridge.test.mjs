import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const originalWindow = globalThis.window, originalFetch = globalThis.fetch
let directory, api, networkRequests = 0
function windowFor(protocol, bridge) {
  const values = new Map()
  globalThis.window = { location: { protocol }, edenAgentDesktop: bridge,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
}
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'eden-auth-bridge-'))
  const output = path.join(directory, 'auth.mjs')
  await build({ entryPoints: [fileURLToPath(new URL('../src/lib/auth.ts', import.meta.url))], outfile: output,
    bundle: true, platform: 'browser', format: 'esm', define: { 'import.meta.env.DEV': 'false', __MON_AUTH_MODE__: '"production"' } })
  windowFor('edenagent:')
  globalThis.fetch = async () => { networkRequests++; throw new Error('Unexpected browser request') }
  api = await import(pathToFileURL(output).href)
})
after(async () => {
  globalThis.window = originalWindow; globalThis.fetch = originalFetch
  await rm(directory, { recursive: true, force: true })
})
test('packaged desktop cannot fall back to a fixed browser Core address when its bridge is missing', async () => {
  windowFor('edenagent:')
  await assert.rejects(api.resolveCoreBaseUrl(), /桥接不可用/)
  await assert.rejects(api.loginWithCore('synthetic-account', 'synthetic-password'), /桥接不可用/)
  assert.equal(networkRequests, 0)
})
test('desktop Core address is supplied by the bridge and remains installation-specific', async () => {
  const commands = []
  windowFor('edenagent:', { invoke: async name => { commands.push(name); return 'http://127.0.0.1:49123/' } })
  assert.equal(await api.resolveCoreBaseUrl(), 'http://127.0.0.1:49123')
  assert.deepEqual(commands, ['resolve_core_base_url_command'])
  assert.equal(networkRequests, 0)
})
test('ordinary browser Core resolution remains available without a desktop bridge', async () => {
  windowFor('http:')
  assert.equal(await api.resolveCoreBaseUrl(), 'http://127.0.0.1:40011')
})
