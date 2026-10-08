import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const previousWindow = globalThis.window
const events = new EventTarget()
globalThis.window = {
  localStorage: { getItem: key => key === "agent.runtime_origin" ? "mon" : null },
  addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
  dispatchEvent: events.dispatchEvent.bind(events),
}
const calls = []
const status = { available: true, reason: null, root: "E:/explicit", bound: false }
let reply = async method => method === "sharedWorkspace.status" ? status : {
  spaces: [], files: [], conflicts: [], members: [], devices: [], versions: [], space: { id: "space-1" },
}
globalThis.__sharedWorkspaceRequest = async (...args) => { calls.push(args); return reply(args[1]) }
const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
  plugins: [{ name: "shared-workspace-transport-fixture", enforce: "pre",
    resolveId(source) { if (/(?:^|\/)rpc-transport(?:\.ts)?$/.test(source)) return "\0shared-workspace-transport" },
    load(id) { return id === "\0shared-workspace-transport"
      ? "export const rpcRequestForOrigin = (...args) => globalThis.__sharedWorkspaceRequest(...args); export const rpcRequest = (method, params) => globalThis.__sharedWorkspaceRequest('mon', method, params)" : null },
  }],
})
after(async () => { await vite.close(); globalThis.window = previousWindow; delete globalThis.__sharedWorkspaceRequest })
const { createSharedWorkspaceClient, readSharedDirectory, selectSharedDirectory } = await vite.ssrLoadModule("/src/lib/shared-workspace-client.ts")

test("creating the scoped client neither binds nor makes a network request", () => {
  calls.length = 0
  const client = createSharedWorkspaceClient("E:/explicit", "session-a")
  assert.equal(client.isCurrent(), true)
  assert.deepEqual(calls, [])
})

test("all service operations carry the displayed workspace and captured account/world", async () => {
  calls.length = 0
  const client = createSharedWorkspaceClient("E:/explicit", "session-a")
  await client.status()
  await client.spaces()
  await client.create("项目")
  await client.bind("space-1")
  await client.sync()
  await client.pause(true)
  await client.conflicts()
  await client.resolve("conflict-1", "remote")
  await client.files()
  await client.history("file-1")
  await client.restore("file-1", 2)
  await client.members()
  await client.setMember(7, "editor")
  await client.removeMember(7)
  await client.devices()
  await client.revokeDevice("device-1")
  assert.equal(calls.length, 16)
  assert.deepEqual(calls[0][2], { sessionId: "session-a" })
  for (const [origin, method, params, revision] of calls.slice(1)) {
    assert.equal(origin, "mon")
    assert.equal(params.expectedWorkspacePath, "E:/explicit", method)
    assert.equal(params.sessionId, "session-a", method)
    assert.equal(revision, calls[0][3])
    assert.equal(Object.hasOwn(params, "token"), false)
  }
  assert.deepEqual(calls.find(call => call[1] === "sharedWorkspace.bind")[2],
    { expectedWorkspacePath: "E:/explicit", sessionId: "session-a", spaceId: "space-1", confirmShare: true })
  assert.deepEqual(calls.find(call => call[1] === "sharedWorkspace.resolve")[2],
    { expectedWorkspacePath: "E:/explicit", sessionId: "session-a", conflictId: "conflict-1", strategy: "remote" })
})

test("invalidating a workspace client prevents subsequent writes", async () => {
  calls.length = 0
  const client = createSharedWorkspaceClient("E:/explicit", "session-a")
  client.invalidate()
  await assert.rejects(client.bind("space-1"), /已切换/)
  assert.deepEqual(calls, [])
})

test("a changed workspace response is rejected instead of showing another directory as selected", async () => {
  const client = createSharedWorkspaceClient("E:/another", "session-b")
  await assert.rejects(client.status(), /共享目录已改变/)
})

test("shared directory selection uses its own revision-checked RPC and event without switching the workspace", async () => {
  calls.length = 0
  reply = async () => ({ path: 'E:/shared-library', revision: 'next', status: 'ready', error: null })
  let changed
  const listener = event => { changed = event.detail }
  events.addEventListener('edenagent:shared-directory-changed', listener)
  try {
    await readSharedDirectory('session-a')
    await selectSharedDirectory('session-a', 'E:/shared-library', 'previous')
    assert.deepEqual(calls.map(call => call[1]), ['sharedWorkspace.directory.read', 'sharedWorkspace.directory.select'])
    assert.deepEqual(calls[1][2], { sessionId: 'session-a', path: 'E:/shared-library', expectedRevision: 'previous' })
    assert.deepEqual(changed, { sessionId: 'session-a', path: 'E:/shared-library' })
  } finally { events.removeEventListener('edenagent:shared-directory-changed', listener) }
})

test("an account switch during a pending operation rejects its completion and blocks later requests", async () => {
  calls.length = 0
  const client = createSharedWorkspaceClient("E:/explicit", "session-a")
  reply = async () => { events.dispatchEvent(new Event("edenagent:account-changed")); return status }
  await assert.rejects(client.sync(), /结果未确认/)
  await assert.rejects(client.sync(), /已切换/)
  assert.equal(calls.length, 1)
})
