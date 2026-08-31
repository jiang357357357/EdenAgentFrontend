const assert = require("node:assert/strict")
const test = require("node:test")
const path = require("node:path")
const {
  createDesktopRuntimeEnvironment,
  normalizeExternalOrigins,
} = require("../src/processes/desktop-runtime-contract.cjs")

test("development desktop uses realm-owned Mon token and explicit ownership", () => {
  const environment = createDesktopRuntimeEnvironment({
    environment: {
      EDEN_AGENT_SERVER_MODE: "external",
      EDEN_AGENT_TOKEN_FILE: "C:\\Agent\\Data\\server-capability.token",
    },
    agentRoot: "C:\\Agent",
    parentPid: 321,
    pathApi: path.win32,
  })

  assert.equal(environment.EDEN_AGENT_DEV_PARENT_PID, "321")
  assert.equal(environment.EDEN_AGENT_EXTERNAL_ORIGINS, "mon")
  assert.equal(environment.EDEN_AGENT_MON_TOKEN_FILE, "C:\\Agent\\Data\\realms\\mon\\capability.token")
  assert.equal(environment.EDEN_AGENT_SERVER_MODE, "")
  assert.equal(environment.EDEN_AGENT_TOKEN_FILE, "")
})

test("runtime contract preserves explicit per-realm token and normalizes origins", () => {
  const environment = createDesktopRuntimeEnvironment({
    environment: { EDEN_AGENT_MON_TOKEN_FILE: "/secure/mon.token" },
    agentRoot: "/workspace/Agent",
    parentPid: 456,
    externalOrigins: "local, mon,mon",
    pathApi: path.posix,
  })

  assert.equal(environment.EDEN_AGENT_EXTERNAL_ORIGINS, "local,mon")
  assert.equal(environment.EDEN_AGENT_MON_TOKEN_FILE, "/secure/mon.token")
})

test("runtime contract rejects unknown origins instead of guessing", () => {
  assert.throws(() => normalizeExternalOrigins("mon,other"), /Unsupported externally managed/)
})
