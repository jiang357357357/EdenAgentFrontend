const assert = require("node:assert/strict")
const test = require("node:test")
const { EventEmitter } = require("node:events")
const { createRustServerManager } = require("../src/processes/rust-server.cjs")

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
  const manager = createRustServerManager({
    app: { isPackaged: true, getPath: () => "C:\\UserData" },
    agentRoot: "C:\\Agent",
    processObject: { platform: "win32", resourcesPath: "C:\\Resources", env: {}, stdout: {}, stderr: {} },
    fileSystem: { existsSync: () => true, mkdirSync: () => {} },
    spawnProcess: (executable, args, options) => {
      const child = childProcess()
      calls.push({ executable, args, options, child })
      return child
    },
    getRuntimeEnvironment: () => ({ EDEN_AGENT_MODEL: "ollama/qwen3", OLLAMA_API_KEY: "local-secret" }),
    ...overrides,
  })
  return { manager, calls }
}

test("packaged desktop starts physically isolated Mon and local Rust servers", () => {
  const { manager, calls } = packagedManager()
  manager.start()
  manager.start()
  assert.equal(calls.length, 2)
  const mon = calls.find((call) => call.options.env.EDEN_AGENT_RUNTIME_ORIGIN === "mon")
  const local = calls.find((call) => call.options.env.EDEN_AGENT_RUNTIME_ORIGIN === "local")
  assert.ok(mon)
  assert.ok(local)
  assert.equal(mon.options.env.EDEN_AGENT_BIND, "127.0.0.1:40092")
  assert.equal(local.options.env.EDEN_AGENT_BIND, "127.0.0.1:40093")
  assert.notEqual(mon.options.env.EDEN_AGENT_CAPABILITY_TOKEN, local.options.env.EDEN_AGENT_CAPABILITY_TOKEN)
  assert.match(mon.options.env.EDEN_AGENT_DATABASE, /realms[\\/]mon[\\/]eden-agent\.db$/)
  assert.match(local.options.env.EDEN_AGENT_DATABASE, /realms[\\/]local[\\/]eden-agent\.db$/)
  assert.match(mon.options.env.EDEN_AGENT_PLUGIN_ROOT, /realms[\\/]mon[\\/]plugins$/)
  assert.match(local.options.env.EDEN_AGENT_PLUGIN_ROOT, /realms[\\/]local[\\/]plugins$/)
  assert.match(mon.options.env.EDEN_AGENT_CONNECTOR_DATA_ROOT, /realms[\\/]mon[\\/]connectors[\\/]runtime$/)
  assert.match(local.options.env.EDEN_AGENT_CONNECTOR_DATA_ROOT, /realms[\\/]local[\\/]connectors[\\/]runtime$/)
  assert.equal(mon.options.env.EDEN_AGENT_CONNECTOR_MANIFEST_ROOT, "C:\\Resources\\manifests")
  assert.equal(local.options.env.EDEN_AGENT_CONNECTOR_MANIFEST_ROOT, "C:\\Resources\\manifests")
  assert.equal(mon.options.env.EDEN_AGENT_ALLOWED_ORIGINS, "edenagent://app")
  assert.equal(local.options.env.EDEN_AGENT_ALLOWED_ORIGINS, "edenagent://app")
  assert.match(mon.options.env.EDEN_AGENT_USER_AGENT_ROOT, /realms[\\/]mon[\\/]agents$/)
  assert.match(local.options.env.EDEN_AGENT_USER_AGENT_ROOT, /realms[\\/]local[\\/]agents$/)
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

test("external desktop reads a different server-owned token for each realm", () => {
  const files = []
  const manager = createRustServerManager({
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
  })
  assert.deepEqual(manager.start(), [null, null])
  assert.equal(manager.capability("mon").token, "a".repeat(64))
  assert.equal(manager.capability("local").token, "b".repeat(64))
  assert.match(files[0], /realms[\\/]mon[\\/]capability\.token$/)
  assert.match(files[1], /realms[\\/]local[\\/]capability\.token$/)
})

test("legacy packaged data is copied into both realms without removing the source", () => {
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
  assert.equal(copies.length, 4)
  assert.equal(copies.filter(({ source }) => source.endsWith("eden-agent.db")).length, 2)
  assert.equal(copies.filter(({ source }) => source.endsWith("blobs")).length, 2)
  assert.equal(writes.length, 2)
  assert.match(writes[0].target, /\.realm-migration-pending$/)
  assert.equal(existing.has("C:\\UserData\\server\\eden-agent.db"), true)
})

test("external supervisor reports realm restart as requiring an app restart", async () => {
  const manager = createRustServerManager({
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
  })
  assert.equal(manager.status("local").restartSupported, false)
  assert.deepEqual(await manager.restart("local"), {
    restarted: false,
    externallyManaged: true,
    origin: "local",
  })
})

test("external desktop never invents a missing realm token", () => {
  const manager = createRustServerManager({
    app: { isPackaged: false, getPath: () => "C:\\UserData" },
    agentRoot: "C:\\Agent",
    processObject: { platform: "win32", env: { EDEN_AGENT_SERVER_MODE: "external" }, stdout: {}, stderr: {} },
    fileSystem: {
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }) },
    },
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
