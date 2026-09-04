const assert = require("node:assert/strict")
const path = require("node:path")
const test = require("node:test")

const {
  appFilePathFromUrl,
  desktopAppUrl,
  registerAppProtocol,
} = require("../src/protocols/app-protocol.cjs")

test("desktop application URLs use one stable origin and preserve the page", () => {
  assert.equal(desktopAppUrl(), "edenagent://app/index.html")
  assert.equal(desktopAppUrl("pet character"), "edenagent://app/index.html?page=pet+character")
})

test("application URLs resolve only inside the bundled web root", () => {
  const appRoot = "/opt/eden-agent/web/dist"
  assert.equal(
    appFilePathFromUrl("edenagent://app/assets/index.js", { appRoot, pathApi: path.posix }),
    "/opt/eden-agent/web/dist/assets/index.js",
  )
  assert.throws(
    () => appFilePathFromUrl("edenagent://other/index.html", { appRoot, pathApi: path.posix }),
    /unsupported Eden Agent application URL/,
  )
})

test("registerAppProtocol serves bundled files through Electron net.fetch", () => {
  let scheme = null
  let handler = null
  const fetched = []
  const protocol = {
    handle(nextScheme, nextHandler) {
      scheme = nextScheme
      handler = nextHandler
    },
  }
  const net = {
    fetch(url) {
      fetched.push(url)
      return { ok: true }
    },
  }

  const appRoot = path.resolve("test-fixtures", "web", "dist")
  registerAppProtocol({ protocol, net, appRoot })
  const result = handler({ url: "edenagent://app/assets/index.js" })

  assert.equal(scheme, "edenagent")
  assert.deepEqual(result, { ok: true })
  assert.equal(fetched[0], new URL(`file:///${path.join(appRoot, "assets", "index.js").replaceAll("\\", "/")}`).toString())
})
