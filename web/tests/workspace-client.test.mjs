import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const previousWindow = globalThis.window
const events = new EventTarget()
globalThis.window = {
  localStorage: { getItem: key => key === "agent.runtime_origin" ? "local" : null },
  addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
}
const scopedCalls = []
let request = async (_origin, method) => method === "session.create" ? { id: "audit-created" } : { currentPath: "E:/default" }
globalThis.__workspaceClientRequest = (...args) => { scopedCalls.push(args); return request(...args) }
const transportNames = ["requestSpeechSynthesis", "agentHttpBaseUrl", "apiMessage", "apiSession", "mapMemoForView", "projectSessionEvent",
  "mapAgentThreadForView", "rpcRequest", "rpcRequestWithTimeout", "sessionEventMessageID", "sessionEventMessageRole",
  "resolveVoiceBlobUrl", "sessionEventToolResultCallID", "subscribeRpcEvents", "uploadAttachments"]
const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
  plugins: [{ name: "workspace-client-rpc-fixture", enforce: "pre",
    resolveId(source) { if (/(?:^|\/)rpc-transport(?:\.ts)?$/.test(source)) return "\0workspace-rpc-fixture" },
    load(id) {
      if (id !== "\0workspace-rpc-fixture") return null
      return `export const rpcRequestForOrigin = (...args) => globalThis.__workspaceClientRequest(...args);\n`
        + transportNames.map(name => `export const ${name} = () => { throw new Error('Unexpected ${name}; workspace recovery must not depend on a model'); };`).join("\n")
    },
  }],
})
after(async () => {
  await vite.close()
  globalThis.window = previousWindow
  delete globalThis.__workspaceClientRequest
})
const { switchWorkspace, useDefaultWorkspace, createWorkspaceSession } = await vite.ssrLoadModule("/src/lib/agent-client.ts")

test("explicit new-conversation folder action creates only an empty session without consulting a model", async () => {
  scopedCalls.length = 0
  const result = await createWorkspaceSession()
  assert.equal(result.id, 'audit-created')
  assert.deepEqual(scopedCalls.map(call => call[1]), ['session.create'])
  assert.deepEqual(scopedCalls[0][2], { title: '新会话', participants: [] })
})

test("choosing a workspace requires an explicitly selected session and never creates an audit conversation", async () => {
  scopedCalls.length = 0
  await assert.rejects(switchWorkspace(undefined, "E:/selected"), /先创建或选择/)
  assert.deepEqual(scopedCalls, [])
})

test("default workspace recovery reuses an existing session and invokes its dedicated RPC", async () => {
  scopedCalls.length = 0
  const result = await useDefaultWorkspace("existing-session")
  assert.equal(scopedCalls.length, 1)
  assert.equal(scopedCalls[0][1], "workspace.useDefault")
  assert.deepEqual(scopedCalls[0][2], { sessionId: "existing-session" })
  assert.equal(result.createdAuditSession, false)
})

test("default workspace selection also requires a selected conversation", async () => {
  scopedCalls.length = 0
  await assert.rejects(useDefaultWorkspace(undefined), /先创建或选择/)
  assert.deepEqual(scopedCalls, [])
})

test("an account change during explicit workspace selection rejects its stale result", async () => {
  scopedCalls.length = 0
  request = async () => {
    events.dispatchEvent(new Event("edenagent:account-changed"))
    return { id: "previous-account-session" }
  }
  await assert.rejects(switchWorkspace("selected-session", "E:/old-account"), /World changed/)
  assert.deepEqual(scopedCalls.map(call => call[1]), ["workspace.switch"])
})

test("a late workspace response from a previous identity cannot be treated as successful recovery", async () => {
  scopedCalls.length = 0
  request = async () => {
    events.dispatchEvent(new Event("edenagent:account-changed"))
    return { currentPath: "E:/previous-account" }
  }
  await assert.rejects(useDefaultWorkspace("previous-session"), /World changed/)
  assert.deepEqual(scopedCalls.map(call => call[1]), ["workspace.useDefault"])
})
