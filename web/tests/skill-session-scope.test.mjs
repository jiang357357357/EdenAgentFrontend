import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
  plugins: [{ name: 'skill-session-rpc-fixture', enforce: 'pre',
    resolveId(source) { if (/(?:^|\/)rpc-transport(?:\.ts)?$/.test(source)) return '\0skill-rpc-fixture' },
    load(id) { if (id === '\0skill-rpc-fixture') return 'export const rpcRequest = () => {}; export const rpcRequestForOrigin = () => {};' },
  }],
})
after(() => vite.close())
const { createSkillClient } = await vite.ssrLoadModule('/src/lib/skill-client.ts')
const skill = { name: 'fixture', sourceType: 'local', scope: 'project', manifest: {}, totalBytes: '1', files: [], content: 'fixture' }
function fixture() {
  const calls = []
  const rpc = async (method, params) => { calls.push({ method, params }); return method === 'skill.list' ? [] : skill }
  return { calls, a: createSkillClient(rpc, 'session-A'), b: createSkillClient(rpc, 'session-B') }
}

test('concurrent skill readers retain their own session and late completion cannot retarget a client', async () => {
  const { a, b, calls } = fixture()
  await Promise.all([a.listSkills(), b.listSkills(), a.getSkillDetails('fixture'), b.catalogStatus()])
  assert.deepEqual(calls.map(call => call.params.sessionId), ['session-A', 'session-B', 'session-A', 'session-B'])
})

test('project skill changes and preview installation carry the chosen session', async () => {
  const { a, calls } = fixture()
  await a.setSkillEnabled('fixture', true, { scope: 'project', contentHash: 'expected', workspaceRoot: 'chosen' })
  await a.uninstallSkill('fixture', { scope: 'project', contentHash: 'expected', workspaceRoot: 'chosen' })
  await a.installSkill('project-preview', 'project')
  assert.ok(calls.every(call => call.params.sessionId === 'session-A'))
  assert.equal(calls[0].params.expectedWorkspaceRoot, 'chosen')
})

test('explicit user skill changes remain account management operations', async () => {
  const { a, calls } = fixture()
  await a.setSkillEnabled('fixture', true, { scope: 'user' })
  await a.uninstallSkill('fixture', { scope: 'user' })
  await a.installSkill('user-preview', 'user')
  assert.ok(calls.every(call => !Object.hasOwn(call.params, 'sessionId')))
})
