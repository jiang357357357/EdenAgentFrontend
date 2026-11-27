import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false } })
after(() => vite.close())
const { parseConnectionImport } = await vite.ssrLoadModule('/src/pages/connectors/connection-import.ts')
const valid = { schemaVersion: 1, connectorKey: 'douyinbot', identityKey: '100', settings: { endpoint: 'http://127.0.0.1:40096' } }
test('connection imports only loopback account configuration and rejects credentials or remote hosts', () => {
  assert.deepEqual(parseConnectionImport(JSON.stringify(valid)), { connectorKey: 'douyinbot', identityKey: '100', settings: valid.settings })
  for (const value of [{ ...valid, credential: 'secret' }, { ...valid, identityKey: 'wrong' },
    { ...valid, settings: { endpoint: 'http://example.com:40096' } }, { ...valid, settings: { endpoint: 'http://user:secret@127.0.0.1:40096' } },
    { ...valid, settings: { ...valid.settings, credential: 'secret' } }]) assert.throws(() => parseConnectionImport(JSON.stringify(value)))
})
