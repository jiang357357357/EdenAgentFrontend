const assert = require("node:assert/strict")
const test = require("node:test")

const { isInternalAppUrl, isSupportedExternalUrl } = require("../src/protocols/navigation-policy.cjs")
const { createWebAppLoader } = require("../src/windows/web-app-loader.cjs")

function createFakeWindow() {
  const handlers = new Map()
  return {
    handlers,
    webContents: {
      setWindowOpenHandler(handler) { handlers.set("window-open", handler) },
      on(event, handler) { handlers.set(event, handler) },
    },
    loadFileCalls: [],
    loadUrlCalls: [],
    loadFile(filePath, options) { this.loadFileCalls.push([filePath, options]) },
    loadURL(url) { this.loadUrlCalls.push(url) },
  }
}

function createLoader(overrides = {}) {
  const opened = []
  const warnings = []
  const loader = createWebAppLoader({
    app: { isPackaged: false },
    shell: { openExternal: async (url) => { opened.push(url) } },
    frontendRoot: "C:\\Mon\\Agent\\frontend",
    getWebPort: () => "40091",
    defaultWebPort: 40091,
    isInternalAppUrl,
    isSupportedExternalUrl,
    logger: { warn: (...args) => warnings.push(args) },
    pathApi: { join: (...parts) => parts.join("/") },
    ...overrides,
  })
  return { loader, opened, warnings }
}

test("development pages resolve against the configured local port", () => {
  const { loader } = createLoader({ getWebPort: () => "40123" })
  assert.equal(loader.resolveWebUrl(), "http://127.0.0.1:40123")
  assert.equal(loader.resolveWebUrl("settings"), "http://127.0.0.1:40123/?page=settings")
})

test("development loading attaches guards and loads the local URL", () => {
  const { loader } = createLoader()
  const targetWindow = createFakeWindow()

  loader.loadWebApp(targetWindow, "pet-character")

  assert.deepEqual(targetWindow.loadUrlCalls, ["http://127.0.0.1:40091/?page=pet-character"])
  assert.equal(targetWindow.handlers.has("window-open"), true)
  assert.equal(targetWindow.handlers.has("will-navigate"), true)
  assert.equal(targetWindow.handlers.has("will-redirect"), true)
})

test("packaged loading uses the stable privileged application origin", () => {
  const { loader } = createLoader({ app: { isPackaged: true } })
  const targetWindow = createFakeWindow()

  loader.loadWebApp(targetWindow, "settings")

  assert.deepEqual(targetWindow.loadFileCalls, [])
  assert.deepEqual(targetWindow.loadUrlCalls, ["edenagent://app/index.html?page=settings"])
})

test("navigation guards deny new windows and externalize supported links", async () => {
  const { loader, opened, warnings } = createLoader()
  const targetWindow = createFakeWindow()
  loader.attachNavigationPolicy(targetWindow)

  assert.deepEqual(targetWindow.handlers.get("window-open")({ url: "https://example.com/help" }), { action: "deny" })
  await Promise.resolve()
  assert.deepEqual(opened, ["https://example.com/help"])

  const event = { prevented: false, preventDefault() { this.prevented = true } }
  targetWindow.handlers.get("will-navigate")(event, "javascript:alert(1)")
  assert.equal(event.prevented, true)
  assert.equal(warnings.length, 1)
})
