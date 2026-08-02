const assert = require("node:assert/strict")
const test = require("node:test")

const {
  createMediaAccessResolver,
  registerMediaPermissions,
} = require("../src/permissions/register-media-permissions.cjs")

test("media access allows camera only for the main window", () => {
  const mainWindow = { isDestroyed: () => false }
  const bubbleWindow = { isDestroyed: () => false }
  const mainContents = { owner: mainWindow }
  const bubbleContents = { owner: bubbleWindow }
  const resolve = createMediaAccessResolver({
    BrowserWindow: { fromWebContents: (contents) => contents.owner },
    getMainWindow: () => mainWindow,
    getPetBubbleWindow: () => bubbleWindow,
  })

  assert.deepEqual(resolve(mainContents), { allowAudio: true, allowVideo: true })
  assert.deepEqual(resolve(bubbleContents), { allowAudio: true, allowVideo: false })
  assert.deepEqual(resolve({ owner: {} }), { allowAudio: false, allowVideo: false })
})

test("registerMediaPermissions installs check and request handlers", () => {
  const mainWindow = { isDestroyed: () => false }
  const mainContents = { owner: mainWindow }
  const handlers = {}
  const defaultSession = {
    setPermissionCheckHandler(handler) { handlers.check = handler },
    setPermissionRequestHandler(handler) { handlers.request = handler },
  }
  registerMediaPermissions({
    defaultSession,
    BrowserWindow: { fromWebContents: (contents) => contents.owner },
    getMainWindow: () => mainWindow,
    getPetBubbleWindow: () => null,
  })

  assert.equal(handlers.check(mainContents, "media", "", { mediaType: "video" }), true)
  let allowed = null
  handlers.request(mainContents, "media", (value) => { allowed = value }, { mediaTypes: ["video"] })
  assert.equal(allowed, true)
})
