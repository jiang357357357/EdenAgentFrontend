const assert = require("node:assert/strict")
const test = require("node:test")

const { createDesktopQuitFlagController, isDevelopmentParentPid } = require("../src/processes/desktop-quit-flag.cjs")

const FLAG_PATH = "/mon/.artifacts/desktop-quit.flag"

function memoryFileSystem(existing = {}) {
  const files = { ...existing }
  return {
    existsSync(filePath) { return filePath in files },
    mkdirSync() {},
    writeFileSync(filePath) { files[filePath] = String(Date.now()) },
    rmSync(filePath) { delete files[filePath] },
  }
}

function controllerFor(environment, existing = {}) {
  return createDesktopQuitFlagController({
    quitFlagPath: FLAG_PATH,
    environment,
    fileSystem: memoryFileSystem(existing),
  })
}

test("a standalone launch removes a stale quit flag", () => {
  const controller = controllerFor({}, { [FLAG_PATH]: "stale" })
  assert.equal(controller.isExternallyManaged(), false)
  assert.equal(controller.hasQuitFlag(), true)
  assert.equal(controller.clearStaleFlagForLaunch(), true)
  assert.equal(controller.hasQuitFlag(), false)
})

test("an externally managed launch with an explicit quit flag preserves it", () => {
  const controller = controllerFor(
    { MON_AGENT_DESKTOP_QUIT_FLAG: "/dev-runner/desktop-quit.flag" },
    { [FLAG_PATH]: "stale" },
  )
  assert.equal(controller.isExternallyManaged(), true)
  assert.equal(controller.clearStaleFlagForLaunch(), false)
  assert.equal(controller.hasQuitFlag(), true)
})

test("an externally managed launch identified by dev parent pid preserves the flag", () => {
  const controller = controllerFor({ MON_AGENT_DEV_PARENT_PID: "321" }, { [FLAG_PATH]: "stale" })
  assert.equal(controller.isExternallyManaged(), true)
  assert.equal(controller.clearStaleFlagForLaunch(), false)
  assert.equal(controller.hasQuitFlag(), true)
})

test("a standalone quit does not write the quit flag", () => {
  const controller = controllerFor({})
  assert.equal(controller.signalQuit(), false)
  assert.equal(controller.hasQuitFlag(), false)
})

test("an externally managed quit writes the coordination flag", () => {
  const controller = controllerFor(
    { MON_AGENT_DESKTOP_QUIT_FLAG: "/dev-runner/desktop-quit.flag" },
  )
  assert.equal(controller.signalQuit(), true)
  assert.equal(controller.hasQuitFlag(), true)
})

test("hasQuitFlag reflects the current flag existence", () => {
  const controller = controllerFor({})
  assert.equal(controller.hasQuitFlag(), false)
  assert.equal(controller.writeQuitFlag(), true)
  assert.equal(controller.hasQuitFlag(), true)
  assert.equal(controller.removeQuitFlag(), true)
  assert.equal(controller.hasQuitFlag(), false)
})

test("isDevelopmentParentPid only accepts a valid process id", () => {
  assert.equal(isDevelopmentParentPid("321"), true)
  assert.equal(isDevelopmentParentPid(321), false)
  assert.equal(isDevelopmentParentPid("1"), false)
  assert.equal(isDevelopmentParentPid("0"), false)
  assert.equal(isDevelopmentParentPid(""), false)
  assert.equal(isDevelopmentParentPid("abc"), false)
  assert.equal(isDevelopmentParentPid(undefined), false)
})

test("controller requires a quit flag path", () => {
  assert.throws(() => createDesktopQuitFlagController({}), TypeError)
})
