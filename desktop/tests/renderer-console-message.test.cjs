const assert = require("node:assert/strict")
const test = require("node:test")

const {
  rendererConsoleDetails,
  rendererConsoleError,
} = require("../src/windows/renderer-console-message.cjs")

test("reads Electron 42 console details from the event object", () => {
  const event = {
    level: "error",
    message: "Spine failed",
    lineNumber: 73,
    sourceId: "renderer.tsx",
  }

  assert.equal(rendererConsoleDetails(event).message, "Spine failed")
  assert.equal(rendererConsoleError(event), "Spine failed (renderer.tsx:73)")
})

test("keeps compatibility with the previous details argument", () => {
  const details = { level: "error", message: "Legacy failure", lineNumber: 5, sourceId: "legacy.js" }

  assert.equal(rendererConsoleDetails({}, [details]), details)
  assert.equal(rendererConsoleError({}, [details]), "Legacy failure (legacy.js:5)")
})

test("ignores non-error renderer messages", () => {
  assert.equal(rendererConsoleError({ level: "info", message: "ready" }), null)
})

