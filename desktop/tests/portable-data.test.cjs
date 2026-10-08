const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")
const { configurePortableDesktopData } = require("../src/app/portable-data.cjs")
const { createLocalRuntimeConfigStore } = require("../src/app/local-runtime-config.cjs")
const { createAgentServerManager } = require("../src/processes/agent-server.cjs")

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eden-portable-desktop-"))
  t.after(() => {
    const relative = path.relative(os.tmpdir(), directory)
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  return directory
}

function desktopApp(userData, overrides = {}) {
  const paths = { userData, sessionData: userData }
  const calls = []
  return {
    isPackaged: true,
    isReady: () => false,
    paths,
    calls,
    getPath: (name) => paths[name],
    setPath(name, value) { paths[name] = value; calls.push(name) },
    ...overrides,
  }
}

function localStore(app, workspaceRoot) {
  return createLocalRuntimeConfigStore({ app, agentRoot: path.join(workspaceRoot, "runtime", "agent") })
}

function localDataRoot(app, workspaceRoot) {
  const manager = createAgentServerManager({
    app,
    agentRoot: path.join(workspaceRoot, "runtime", "agent"),
    processObject: { platform: process.platform, env: { EDEN_AGENT_EXTERNAL_ORIGINS: "mon" } },
    spawnProcess: () => { throw new Error("This test must not start a server") },
    takeOverPort: () => { throw new Error("This test must not access a real port") },
  })
  manager.prepareRealmData()
  return manager.dataRoots().local
}

test("portable profile under a Chinese path with spaces keeps local configuration and runtime data after relocation", (t) => {
  const temporaryRoot = temporaryDirectory(t)
  const originalRoot = path.join(temporaryRoot, "原来的 安装目录")
  const movedRoot = path.join(temporaryRoot, "移动后的 便携包")
  const globalProfile = path.join(temporaryRoot, "global-profile")
  fs.mkdirSync(originalRoot)
  const app = desktopApp(globalProfile)
  const foreignStore = localStore(app, originalRoot)
  foreignStore.save({ provider: "ollama", model: "foreign-model", apiKey: "fixture-other-installation" })
  const foreignContents = fs.readFileSync(foreignStore.filePath, "utf8")

  const directory = configurePortableDesktopData({ app, workspaceRoot: originalRoot })
  const expected = path.join(fs.realpathSync(originalRoot), "Data", "Desktop", "Agent")
  assert.equal(directory, expected)
  assert.deepEqual(app.paths, { userData: expected, sessionData: expected })
  assert.deepEqual(app.calls, ["userData", "sessionData"])
  const store = localStore(app, originalRoot)
  assert.equal(store.read({}).hasApiKey, false)
  store.save({ provider: "ollama", model: "portable-model", character: { name: "包内角色" } })
  const dataRoot = localDataRoot(app, originalRoot)
  assert.equal(dataRoot, path.join(expected, "server", "realms", "local"))
  assert.equal(store.filePath, path.join(dataRoot, "local-runtime.json"))
  fs.writeFileSync(path.join(dataRoot, "runtime-marker.txt"), "portable-runtime-data")
  fs.writeFileSync(path.join(app.getPath("sessionData"), "session-marker.txt"), "portable-session-data")

  // Both paths are known descendants of this test's temporary directory.
  assert.equal(path.dirname(originalRoot), temporaryRoot)
  assert.equal(path.dirname(movedRoot), temporaryRoot)
  fs.renameSync(originalRoot, movedRoot)
  const restartedApp = desktopApp(globalProfile)
  configurePortableDesktopData({ app: restartedApp, workspaceRoot: movedRoot })
  const restartedStore = localStore(restartedApp, movedRoot)
  assert.equal(restartedStore.read({}).model, "ollama/portable-model")
  assert.equal(restartedStore.read({}).character.name, "包内角色")
  assert.equal(restartedStore.read({}).hasApiKey, false)
  assert.equal(fs.readFileSync(path.join(localDataRoot(restartedApp, movedRoot), "runtime-marker.txt"), "utf8"), "portable-runtime-data")
  assert.equal(fs.readFileSync(path.join(restartedApp.getPath("sessionData"), "session-marker.txt"), "utf8"), "portable-session-data")
  assert.equal(fs.existsSync(originalRoot), false)
  assert.equal(fs.readFileSync(foreignStore.filePath, "utf8"), foreignContents)

  const freshRoot = path.join(temporaryRoot, "另一份 便携包")
  fs.mkdirSync(freshRoot)
  const freshApp = desktopApp(globalProfile)
  configurePortableDesktopData({ app: freshApp, workspaceRoot: freshRoot })
  assert.notEqual(localStore(freshApp, freshRoot).read({}).model, "ollama/portable-model")
  assert.equal(localStore(freshApp, freshRoot).read({}).hasApiKey, false)
})

test("standalone packaged and development desktops retain their existing profiles without touching the filesystem", () => {
  const fileSystem = new Proxy({}, { get() { throw new Error("Unexpected filesystem access") } })
  for (const options of [{ isPackaged: true }, { isPackaged: false, workspaceRoot: "/unused/workspace" }]) {
    const app = desktopApp("existing-profile", { isPackaged: options.isPackaged })
    assert.equal(configurePortableDesktopData({ app, workspaceRoot: options.workspaceRoot, fileSystem }), undefined)
    assert.deepEqual(app.paths, { userData: "existing-profile", sessionData: "existing-profile" })
    assert.deepEqual(app.calls, [])
  }
})

for (const segments of [["Data"], ["Data", "Desktop"], ["Data", "Desktop", "Agent"]]) {
  test(`portable profile rejects ${segments.join("/")} redirection before writing outside its installation`, (t) => {
    const temporaryRoot = temporaryDirectory(t)
    const workspaceRoot = path.join(temporaryRoot, "portable")
    const outside = path.join(temporaryRoot, "outside")
    const link = path.join(workspaceRoot, ...segments)
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.mkdirSync(outside)
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir")
    const app = desktopApp("existing-profile")
    assert.throws(() => configurePortableDesktopData({ app, workspaceRoot }), /符号链接或目录重定向/)
    assert.deepEqual(fs.readdirSync(outside), [])
    assert.deepEqual(app.calls, [])
    assert.equal(app.getPath("userData"), "existing-profile")
  })
}

test("portable profile reports blocked directories without falling back to a global profile", (t) => {
  const workspaceRoot = temporaryDirectory(t)
  fs.writeFileSync(path.join(workspaceRoot, "Data"), "not-a-directory")
  const app = desktopApp("existing-profile")
  assert.throws(() => configurePortableDesktopData({ app, workspaceRoot }), /便携版数据目录不可用.*普通目录/)
  assert.deepEqual(app.calls, [])
})

test("portable profile reports filesystem failures with a safe actionable message", () => {
  const app = desktopApp("existing-profile")
  const fileSystem = { realpathSync() { throw Object.assign(new Error("private-native-error-detail"), { code: "EACCES" }) } }
  assert.throws(() => configurePortableDesktopData({ app, workspaceRoot: "/fixture", fileSystem }), (error) => {
    assert.match(error.message, /安装目录可写/)
    assert.equal(error.message.includes("private-native-error-detail"), false)
    return true
  })
  assert.deepEqual(app.calls, [])
})

test("portable profile must be configured before Electron sessions can initialize", () => {
  const app = desktopApp("existing-profile", { isReady: () => true })
  const fileSystem = new Proxy({}, { get() { throw new Error("Unexpected filesystem access") } })
  assert.throws(() => configurePortableDesktopData({ app, workspaceRoot: "/fixture", fileSystem }), /桌面初始化前配置/)
  assert.deepEqual(app.calls, [])
})
