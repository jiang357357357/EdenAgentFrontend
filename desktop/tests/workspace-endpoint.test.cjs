const assert = require('node:assert/strict')
const test = require('node:test')
const { verifyWorkspaceEndpoint, verifyDesktopCapability } = require('../src/processes/verify-workspace-endpoint.cjs')

test('capability discovery waits for a starting endpoint and preserves the verified access object', async () => {
  const access = { baseUrl: 'http://127.0.0.1:40093', origin: 'local', workspaceId: 'a'.repeat(64), token: 'test-only-token' }
  let calls = 0
  const result = await verifyWorkspaceEndpoint(access, { timeoutMs: 1000, fetchRequest: async () => {
    if (++calls < 3) throw new Error('ECONNREFUSED')
    return { json: async () => ({ workspaceId: access.workspaceId, runtimeOrigin: 'local' }) }
  } })
  assert.equal(result, access); assert.equal(calls, 3)
})

test('a different workspace is rejected immediately even while startup retries are allowed', async () => {
  let calls = 0
  await assert.rejects(verifyWorkspaceEndpoint({ baseUrl: 'http://127.0.0.1:40093', origin: 'local', workspaceId: 'a'.repeat(64) }, {
    timeoutMs: 1000, fetchRequest: async () => { calls++; return { json: async () => ({ workspaceId: 'b'.repeat(64), runtimeOrigin: 'local' }) } },
  }), /其他 EDEN 工作区/)
  assert.equal(calls, 1)
})

test('desktop capability discovery preserves the manager origin and does not fabricate an identity', async () => {
  const access = { baseUrl: 'http://127.0.0.1:40093', token: 'test-only-token' }, origins = []
  const manager = { capability: origin => { origins.push(origin); return access }, status: origin => { origins.push(origin); return { managed: true } } }
  assert.equal(await verifyDesktopCapability(manager, 'local'), access)
  assert.deepEqual(origins, ['local', 'local'])
})
