const assert = require("node:assert/strict")
const test = require("node:test")
const { EventEmitter } = require("node:events")
const { createRustServerManager } = require("../src/processes/rust-server.cjs")

test("packaged desktop starts one Rust server with private durable paths", () => {
  const calls = []
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => true
  const manager = createRustServerManager({
    app: { isPackaged: true, getPath: () => "C:\\UserData" },
    agentRoot: "C:\\Agent",
    processObject: { platform: "win32", resourcesPath: "C:\\Resources", env: {}, stdout: {}, stderr: {} },
    fileSystem: { existsSync: () => true, mkdirSync: () => {} },
    spawnProcess: (executable, args, options) => { calls.push({ executable, args, options }); return child },
    getRuntimeEnvironment: () => ({ EDEN_AGENT_MODEL: "ollama/qwen3", OLLAMA_API_KEY: "local" }),
  })
  manager.start()
  manager.start()
  assert.equal(calls.length, 1)
  assert.match(calls[0].executable, /eden-agent-server\.exe$/)
  assert.equal(calls[0].options.env.EDEN_AGENT_CAPABILITY_TOKEN.length, 64)
  assert.match(calls[0].options.env.EDEN_AGENT_DATABASE, /eden-agent\.db$/)
  assert.match(calls[0].options.env.EDEN_AGENT_LOG_DIRECTORY, /server[\\/]logs$/)
  assert.equal(calls[0].options.env.EDEN_AGENT_MODEL, "ollama/qwen3")
  assert.equal(manager.capability().token, calls[0].options.env.EDEN_AGENT_CAPABILITY_TOKEN)
})

test("managed desktop can restart the Rust server with refreshed configuration", async () => {
  const calls = []
  let model = "openai/gpt-4o-mini"
  const manager = createRustServerManager({
    app: { isPackaged: true, getPath: () => "C:\\UserData" },
    agentRoot: "C:\\Agent",
    processObject: { platform: "win32", resourcesPath: "C:\\Resources", env: {}, stdout: {}, stderr: {} },
    fileSystem: { existsSync: () => true, mkdirSync: () => {} },
    getRuntimeEnvironment: () => ({ EDEN_AGENT_MODEL: model }),
    spawnProcess: (executable, args, options) => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = () => { queueMicrotask(() => child.emit("exit", 0)); return true }
      calls.push({ executable, args, options, child })
      return child
    },
  })
  manager.start()
  model = "ollama/qwen3"
  const result = await manager.restart()
  assert.deepEqual(result, { restarted: true, externallyManaged: false })
  assert.equal(calls.length, 2)
  assert.equal(calls[1].options.env.EDEN_AGENT_MODEL, "ollama/qwen3")
})

test("externally managed desktop reads the server-owned capability token", () => {
  const calls = []
  const serverToken = "a".repeat(64)
  const manager = createRustServerManager({
    app: { isPackaged: false, getPath: () => "C:\\UserData" },
    agentRoot: "C:\\Agent",
    processObject: {
      platform: "win32",
      env: { EDEN_AGENT_SERVER_MODE: "external" },
      stdout: {},
      stderr: {},
    },
    fileSystem: {
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: (filePath) => {
        assert.equal(filePath, "C:\\Agent\\Data\\server-capability.token")
        return `${serverToken}\n`
      },
    },
    spawnProcess: (...args) => { calls.push(args) },
  })

  assert.equal(manager.start(), null)
  assert.equal(calls.length, 0)
  assert.equal(manager.capability().token, serverToken)
})

test("externally managed Linux desktop restarts the MonPM server", async () => {
  const calls = []
  const manager = createRustServerManager({
    app: { isPackaged: false, getPath: () => "/tmp/user-data" },
    agentRoot: "/workspace/Agent",
    processObject: {
      platform: "linux",
      env: { EDEN_AGENT_SERVER_MODE: "external" },
      stdout: {},
      stderr: {},
    },
    fileSystem: {
      existsSync: (filePath) => filePath.endsWith("/Script/Process/linux/server/restart_process.sh"),
      mkdirSync: () => {},
    },
    spawnProcess: (executable, args, options) => {
      calls.push({ executable, args, options })
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      queueMicrotask(() => child.emit("exit", 0, null))
      return child
    },
  })

  assert.equal(manager.status().restartSupported, true)
  assert.deepEqual(await manager.restart(), { restarted: true, externallyManaged: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].executable, "bash")
  assert.equal(calls[0].args[0], "/workspace/Agent/Script/Process/linux/server/restart_process.sh")
})

test("externally managed desktop does not invent a token before the server is ready", () => {
  const manager = createRustServerManager({
    app: { isPackaged: false, getPath: () => "C:\\UserData" },
    agentRoot: "C:\\Agent",
    processObject: {
      platform: "win32",
      env: { EDEN_AGENT_SERVER_MODE: "external" },
      stdout: {},
      stderr: {},
    },
    fileSystem: {
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }) },
    },
  })

  assert.throws(
    () => manager.capability(),
    /Externally managed Eden Agent capability token is not ready/,
  )
})
