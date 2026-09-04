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

test("packaged mode only permits the fixed privileged application entry", () => {
  const options = { isPackaged: true }
  assert.equal(isInternalAppUrl("edenagent://app/index.html?page=settings", options), true)
  assert.equal(isInternalAppUrl("edenagent://app/assets/index.js", options), false)
  assert.equal(isInternalAppUrl("edenagent://other/index.html", options), false)
  assert.equal(isInternalAppUrl("file:///tmp/index.html", options), false)
})

test("external navigation is limited to browser and email protocols", () => {
  assert.equal(isSupportedExternalUrl("https://www.rust-lang.org/"), true)
  assert.equal(isSupportedExternalUrl("http://example.com"), true)
  assert.equal(isSupportedExternalUrl("mailto:hello@example.com"), true)
  assert.equal(isSupportedExternalUrl("javascript:alert(1)"), false)
  assert.equal(isSupportedExternalUrl("file:///etc/passwd"), false)
})
