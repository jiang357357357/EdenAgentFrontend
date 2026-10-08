const assert = require("node:assert/strict")
const test = require("node:test")
const { EventEmitter } = require("node:events")
const { createAgentServerManager } = require("../src/processes/agent-server.cjs")

function childProcess() {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => {
    queueMicrotask(() => child.emit("exit", 0))
    return true
  }
  return child
}

function packagedManager(overrides = {}) {
  const calls = []
  const takeovers = []
  const manager = createAgentServerManager({
    app: { isPackaged: true, getPath: () => "C:\\UserData" },
    agentRoot: "C:\\Agent",
    processObject: { platform: "win32", resourcesPath: "C:\\Resources", env: {}, stdout: {}, stderr: {} },
    fileSystem: { existsSync: filename => !filename.endsWith('.monworkspace'), mkdirSync: () => {} },
    spawnProcess: (executable, args, options) => {
      const child = childProcess()
      calls.push({ executable, args, options, child })
      return child
    },
    takeOverPort: (port, label) => takeovers.push({ port, label }),
    getRuntimeEnvironment: () => ({ EDEN_AGENT_MODEL: "ollama/qwen3", OLLAMA_API_KEY: "local-secret" }),
    ...overrides,
  })
  return { manager, calls, takeovers }
}

test("packaged desktop checks realm ports before starting isolated Mon and local Node servers", () => {
  const { manager, calls, takeovers } = packagedManager()
  manager.start()
  manager.start()
  assert.equal(calls.length, 2)
  assert.deepEqual(takeovers, [
    { port: 40092, label: "mon Agent Server" },
    { port: 40093, label: "local Agent Server" },
  ])
  const mon = calls.find((call) => call.options.env.EDEN_AGENT_RUNTIME_ORIGIN === "mon")
  const local = calls.find((call) => call.options.env.EDEN_AGENT_RUNTIME_ORIGIN === "local")
  assert.ok(mon)
  assert.ok(local)
  assert.equal(mon.options.env.EDEN_AGENT_PORT, "40092")
  assert.equal(local.options.env.EDEN_AGENT_PORT, "40093")
  assert.notEqual(mon.options.env.EDEN_AGENT_CAPABILITY_TOKEN, local.options.env.EDEN_AGENT_CAPABILITY_TOKEN)
  assert.match(mon.options.env.EDEN_AGENT_DATA_ROOT, /realms[\\/]mon$/)
  assert.match(local.options.env.EDEN_AGENT_DATA_ROOT, /realms[\\/]local$/)
  assert.equal(mon.executable, "C:\\Resources\\node\\node.exe")
  assert.deepEqual(mon.args, ["C:\\Resources\\server\\main.mjs"])
  assert.equal(mon.options.env.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(mon.options.env.EDEN_AGENT_ALLOWED_ORIGINS, "edenagent://app")
  assert.equal(local.options.env.EDEN_AGENT_ALLOWED_ORIGINS, "edenagent://app")
  assert.equal(mon.options.env.EDEN_AGENT_MODEL, undefined)
  assert.equal(mon.options.env.OLLAMA_API_KEY, undefined)
  assert.equal(local.options.env.EDEN_AGENT_MODEL, "ollama/qwen3")
  assert.equal(local.options.env.OLLAMA_API_KEY, "local-secret")
  assert.deepEqual(manager.capability("local"), {
    token: local.options.env.EDEN_AGENT_CAPABILITY_TOKEN,
    origin: "local",
    baseUrl: "http://127.0.0.1:40093",
  })
})

test("changing the local model restarts only the local realm", async () => {
  let model = "openai/gpt-4o-mini"
  const { manager, calls } = packagedManager({
    getRuntimeEnvironment: () => ({ EDEN_AGENT_MODEL: model }),
    takeOverPort: () => {},
  })
  manager.start()
  const monChild = calls.find((call) => call.options.env.EDEN_AGENT_RUNTIME_ORIGIN === "mon").child
  model = "ollama/qwen3"
  const result = await manager.restart("local")
  assert.deepEqual(result, { restarted: true, externallyManaged: false, origin: "local" })
  assert.equal(calls.length, 3)
  assert.equal(calls[2].options.env.EDEN_AGENT_RUNTIME_ORIGIN, "local")
  assert.equal(calls[2].options.env.EDEN_AGENT_MODEL, "ollama/qwen3")
  assert.equal(monChild.listenerCount("exit") > 0, true)
})

test("desktop forwards shared logging settings to both realm processes without leaking local model credentials", () => {
  const logging = {
    EDEN_AGENT_LOG_FORMAT: "json",
    EDEN_AGENT_LOG_DIR: "C:\\Agent Logs",
    MON_LOG_START_DIR: "C:\\Workspace\\Mon",
    NO_COLOR: "",
    FORCE_COLOR: "0",
  }
  const credentials = {
    EDEN_AGENT_MODEL: "openai/local-model",
    OPENAI_API_KEY: "local-model-secret",
    OPENAI_BASE_URL: "https://local-model.invalid/v1",
    OLLAMA_API_KEY: "local-ollama-secret",
  }
  const { manager, calls } = packagedManager({
    processObject: {
      platform: "win32", resourcesPath: "C:\\Resources",
      env: { ...logging, ...credentials, UNRELATED_SECRET: "must-not-be-forwarded" }, stdout: {}, stderr: {},
    },
    getRuntimeEnvironment: () => credentials,
  })
  manager.start()
  assert.equal(calls.length, 2)
  for (const call of calls) {
    const environment = call.options.env
    for (const [key, value] of Object.entries(logging)) assert.equal(environment[key], value, `${environment.EDEN_AGENT_RUNTIME_ORIGIN}: ${key}`)
    assert.equal(environment.UNRELATED_SECRET, undefined)
    for (const [key, value] of Object.entries(credentials)) {
      assert.equal(environment[key], environment.EDEN_AGENT_RUNTIME_ORIGIN === "local" ? value : undefined, key)
    }
  }
})

test("desktop leaves unspecified logging settings absent so the server can apply its own defaults", () => {
  const { manager, calls } = packagedManager()
  manager.start()
  for (const { options } of calls) {
    for (const key of ["EDEN_AGENT_LOG_FORMAT", "EDEN_AGENT_LOG_DIR", "MON_LOG_START_DIR", "NO_COLOR", "FORCE_COLOR"]) {
      assert.equal(Object.hasOwn(options.env, key), false, `${options.env.EDEN_AGENT_RUNTIME_ORIGIN}: ${key}`)
    }
  }
})

test("external desktop reads a different server-owned token for each realm", () => {
  const files = []
  const manager = createAgentServerManager({
    app: { isPackaged: false, getPath: () => "C:\\UserData" },
    agentRoot: "C:\\Agent",
    processObject: { platform: "win32", env: { EDEN_AGENT_SERVER_MODE: "external" }, stdout: {}, stderr: {} },
    fileSystem: {
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: (filePath) => {
        files.push(filePath)
        return filePath.includes("local") ? `${"b".repeat(64)}\n` : `${"a".repeat(64)}\n`
      },
    },
    takeOverPort: () => {},
  })
  assert.deepEqual(manager.start(), [null, null])
  assert.equal(manager.capability("mon").token, "a".repeat(64))
  assert.equal(manager.capability("local").token, "b".repeat(64))
  assert.match(files[0], /realms[\\/]mon[\\/]capability\.token$/)
  assert.match(files[1], /realms[\\/]local[\\/]capability\.token$/)
})

test("desktop prepares empty current roots without copying legacy data", () => {
  const copies = []
  const writes = []
  const existing = new Set([
    "C:\\UserData\\server\\eden-agent.db",
    "C:\\UserData\\server\\blobs",
  ])
  const { manager } = packagedManager({
    fileSystem: {
      existsSync: (filePath) => existing.has(filePath),
      mkdirSync: () => {},
      cpSync: (source, target) => copies.push({ source, target }),
      writeFileSync: (target, value) => writes.push({ target, value }),
    },
  })
  manager.prepareRealmData()
  assert.equal(copies.length, 0)
  assert.equal(writes.length, 0)
  assert.equal(existing.has("C:\\UserData\\server\\eden-agent.db"), true)
})

test("external supervisor reports realm restart as requiring an app restart", async () => {
  const manager = createAgentServerManager({
    app: { isPackaged: false, getPath: () => "/tmp/user-data" },
    agentRoot: "/workspace/Agent",
    processObject: {
      platform: "linux",
      env: {
        EDEN_AGENT_SERVER_MODE: "external",
        EDEN_AGENT_MON_CAPABILITY_TOKEN: "a".repeat(64),
        EDEN_AGENT_LOCAL_CAPABILITY_TOKEN: "b".repeat(64),
      },
      stdout: {},
      stderr: {},
    },
    fileSystem: { existsSync: () => true, mkdirSync: () => {} },
    takeOverPort: () => {},
  })
  assert.equal(manager.status("local").restartSupported, false)
  assert.deepEqual(await manager.restart("local"), {
    restarted: false,
    externallyManaged: true,
    origin: "local",
  })
})

test("external desktop never invents a missing realm token", () => {
  const manager = createAgentServerManager({
    app: { isPackaged: false, getPath: () => "C:\\UserData" },
    agentRoot: "C:\\Agent",
    processObject: { platform: "win32", env: { EDEN_AGENT_SERVER_MODE: "external" }, stdout: {}, stderr: {} },
    fileSystem: {
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }) },
    },
    takeOverPort: () => {},
  })
  assert.throws(() => manager.capability("local"), /local capability token is not ready/)
  assert.throws(() => manager.capability("other"), /Unsupported Eden Agent runtime origin/)
})

test("workspace supervisor can own Mon while desktop still owns local realm", () => {
  const { manager, calls } = packagedManager({
    processObject: {
      platform: "win32",
      resourcesPath: "C:\\Resources",
      env: {
        EDEN_AGENT_EXTERNAL_ORIGINS: "mon",
        EDEN_AGENT_MON_CAPABILITY_TOKEN: "a".repeat(64),
      },
      stdout: {},
      stderr: {},
    },
  })
  manager.start()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.env.EDEN_AGENT_RUNTIME_ORIGIN, "local")
  assert.equal(manager.status("mon").externallyManaged, true)
  assert.equal(manager.status("local").externallyManaged, false)
  assert.equal(manager.capability("mon").token, "a".repeat(64))
})

test("development parent controls lifecycle without implicitly externalizing both realms", () => {
  const files = []
  const { manager, calls } = packagedManager({
    processObject: {
      platform: "win32",
      resourcesPath: "C:\\Resources",
      env: {
        EDEN_AGENT_DEV_PARENT_PID: "321",
        EDEN_AGENT_EXTERNAL_ORIGINS: "mon",
        EDEN_AGENT_MON_TOKEN_FILE: "C:\\Agent\\Data\\realms\\mon\\capability.token",
        EDEN_AGENT_TOKEN_FILE: "C:\\Agent\\Data\\server-capability.token",
      },
      stdout: {},
      stderr: {},
    },
    fileSystem: {
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: (filePath) => {
        files.push(filePath)
        return `${"a".repeat(64)}\n`
      },
    },
  })
  manager.start()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.env.EDEN_AGENT_RUNTIME_ORIGIN, "local")
  assert.equal(manager.status("mon").externallyManaged, true)
  assert.equal(manager.status("local").externallyManaged, false)
  assert.equal(manager.capability("mon").token, "a".repeat(64))
  assert.deepEqual(files, ["C:\\Agent\\Data\\realms\\mon\\capability.token"])
})
