const assert = require("node:assert/strict")
const test = require("node:test")

const { createCoreCommandHandlers } = require("../src/ipc/core-command-handlers.cjs")

function createHandlers() {
  const requests = []
  const sessions = []
  const presence = []
  const handlers = createCoreCommandHandlers({
    resolveCoreBaseUrl: () => "http://127.0.0.1:40011",
    getDevAccount: () => ({ username: "dev" }),
    coreRequest: async (...args) => {
      requests.push(args)
      if (args[0] === "/api/users/login/") return { token: "token", user: { id: 1 }, expires_at: "later" }
      return { ok: true }
    },
    setAuthSession: (...args) => sessions.push(args),
    startActivityPresence: (...args) => presence.push(["start", ...args]),
    verifyCoreTokenOnce: (...args) => ({ verified: args }),
    authHeader: (token) => ({ Authorization: `Bearer ${token}` }),
    stopActivityPresence: () => presence.push(["stop"]),
  })
  return { handlers, presence, requests, sessions }
}

test("core login maps client fields and starts the authenticated session", async () => {
  const { handlers, presence, requests, sessions } = createHandlers()
  const response = await handlers.core_login({ args: { request: {
    username: "user",
    password: "pass",
    clientId: "desktop-1",
    clientType: "desktop",
  } } })

  assert.equal(response.token, "token")
  assert.deepEqual(JSON.parse(requests[0][1].body), {
    username: "user",
    password: "pass",
    client_id: "desktop-1",
    client_type: "desktop",
  })
  assert.equal(sessions[0][0], "token")
  assert.deepEqual(presence[0], ["start", "token", "desktop-1"])
})

test("core settings updates use an authenticated JSON patch", async () => {
  const { handlers, requests } = createHandlers()
  await handlers.core_update_agent_settings({ args: { token: "abc", input: { enabled: true } } })
  assert.deepEqual(requests[0], ["/api/agent/settings/my/", {
    method: "PATCH",
    headers: { Authorization: "Bearer abc", "content-type": "application/json" },
    body: '{"enabled":true}',
  }])
})

test("core logout always clears local authentication state", async () => {
  const { handlers, presence, sessions } = createHandlers()
  await handlers.core_logout({ args: { token: "abc" } })
  assert.deepEqual(sessions.at(-1), [null, null])
  assert.deepEqual(presence.at(-1), ["stop"])
})
