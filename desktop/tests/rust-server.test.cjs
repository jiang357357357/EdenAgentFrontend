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
  })
  manager.start()
  manager.start()
  assert.equal(calls.length, 1)
  assert.match(calls[0].executable, /mon-agent-server\.exe$/)
  assert.equal(calls[0].options.env.MON_AGENT_CAPABILITY_TOKEN.length, 64)
  assert.match(calls[0].options.env.MON_AGENT_DATABASE, /mon-agent\.db$/)
  assert.match(calls[0].options.env.MON_AGENT_LOG_DIRECTORY, /server[\\/]logs$/)
  assert.equal(manager.capability().token, calls[0].options.env.MON_AGENT_CAPABILITY_TOKEN)
})

test("externally managed desktop reads the server-owned capability token", () => {
  const calls = []
  const serverToken = "a".repeat(64)
  const manager = createRustServerManager({
    app: { isPackaged: false, getPath: () => "C:\\UserData" },
    agentRoot: "C:\\Agent",
    processObject: {
      platform: "win32",
      env: { MON_AGENT_SERVER_MODE: "external" },
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

test("externally managed desktop does not invent a token before the server is ready", () => {
  const manager = createRustServerManager({
    app: { isPackaged: false, getPath: () => "C:\\UserData" },
    agentRoot: "C:\\Agent",
    processObject: {
      platform: "win32",
      env: { MON_AGENT_SERVER_MODE: "external" },
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
    /Externally managed MonAgent capability token is not ready/,
  )
})
