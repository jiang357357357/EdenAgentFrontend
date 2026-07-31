const test = require("node:test")
const assert = require("node:assert/strict")

const { shouldAllowMediaPermission } = require("../src/media-permission-policy.cjs")

test("primary chat surface may request microphone or camera separately", () => {
  const access = { allowAudio: true, allowVideo: true }
  assert.equal(shouldAllowMediaPermission({ permission: "media", mediaTypes: ["audio"], ...access }), true)
  assert.equal(shouldAllowMediaPermission({ permission: "media", mediaTypes: ["video"], ...access }), true)
})

test("pet bubble remains audio-only", () => {
  const access = { allowAudio: true, allowVideo: false }
  assert.equal(shouldAllowMediaPermission({ permission: "media", mediaTypes: ["audio"], ...access }), true)
  assert.equal(shouldAllowMediaPermission({ permission: "media", mediaTypes: ["video"], ...access }), false)
})

test("unknown and mixed media requests fail closed", () => {
  const access = { allowAudio: true, allowVideo: false }
  assert.equal(shouldAllowMediaPermission({ permission: "media", mediaTypes: [], ...access }), false)
  assert.equal(shouldAllowMediaPermission({ permission: "media", mediaTypes: ["audio", "video"], ...access }), false)
  assert.equal(shouldAllowMediaPermission({ permission: "notifications", mediaTypes: ["audio"], ...access }), false)
})

test("permission checks accept the singular mediaType form", () => {
  assert.equal(
    shouldAllowMediaPermission({ permission: "media", mediaType: "video", allowVideo: true }),
    true,
  )
  assert.equal(shouldAllowMediaPermission({ permission: "geolocation" }), true)
})
