const path = require("node:path")
const { pathToFileURL } = require("node:url")
const test = require("node:test")
const assert = require("node:assert/strict")

const { isInternalAppUrl, isSupportedExternalUrl } = require("../src/protocols/navigation-policy.cjs")

test("development mode only treats the exact Web origin as internal", () => {
  const options = {
    isPackaged: false,
    devOrigin: "http://127.0.0.1:40091",
  }
  assert.equal(isInternalAppUrl("http://127.0.0.1:40091/?page=settings", options), true)
  assert.equal(isInternalAppUrl("http://127.0.0.1:40092/api/session", options), false)
  assert.equal(isInternalAppUrl("https://www.rust-lang.org/", options), false)
})

test("packaged mode only permits the bundled application entry", () => {
  const appEntryFile = path.resolve("/opt/mon-agent/frontend/web/dist/index.html")
  const options = { isPackaged: true, appEntryFile }
  assert.equal(isInternalAppUrl(`${pathToFileURL(appEntryFile)}?page=settings`, options), true)
  assert.equal(isInternalAppUrl(pathToFileURL("/tmp/index.html").toString(), options), false)
})

test("external navigation is limited to browser and email protocols", () => {
  assert.equal(isSupportedExternalUrl("https://www.rust-lang.org/"), true)
  assert.equal(isSupportedExternalUrl("http://example.com"), true)
  assert.equal(isSupportedExternalUrl("mailto:hello@example.com"), true)
  assert.equal(isSupportedExternalUrl("javascript:alert(1)"), false)
  assert.equal(isSupportedExternalUrl("file:///etc/passwd"), false)
})
