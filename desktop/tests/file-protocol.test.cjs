const assert = require("node:assert/strict")
const test = require("node:test")

const path = require("node:path")

const { desktopFileUrl, filePathFromDesktopUrl, resolveBundledWebAssetPath } = require("../src/protocols/file-protocol.cjs")

test("round-trips Windows paths without losing the drive separator", () => {
  const filePath = "C:\\Users\\测试\\wall #1.jpg"
  const url = desktopFileUrl(filePath)
  assert.equal(filePathFromDesktopUrl(url, "win32"), filePath)
  assert.match(url, /^monagent-file:\/\/local\/file\?path=/)
})

test("round-trips Linux paths through the explicit path parameter", () => {
  const filePath = "/home/test/Pictures/wallpaper.png"
  assert.equal(filePathFromDesktopUrl(desktopFileUrl(filePath), "linux"), filePath)
})

test("recovers Chromium-normalized legacy Windows URLs", () => {
  assert.equal(
    filePathFromDesktopUrl("monagent-file://c/Users/test/wallpaper.jpg", "win32"),
    "C:/Users/test/wallpaper.jpg",
  )
})

test("resolves bundled character assets from public in development and dist when packaged", () => {
  const input = "./characters/arona/spine/arona_spr.skel"
  assert.equal(resolveBundledWebAssetPath(input, {
    preloadDirectory: "/app/desktop/src",
    isPackaged: false,
    pathApi: path.posix,
  }), "/app/web/public/characters/arona/spine/arona_spr.skel")
  assert.equal(resolveBundledWebAssetPath(input, {
    preloadDirectory: "/app/desktop/src",
    isPackaged: true,
    pathApi: path.posix,
  }), "/app/web/dist/characters/arona/spine/arona_spr.skel")
  assert.equal(resolveBundledWebAssetPath("/user/role.png", {
    preloadDirectory: "/app/desktop/src",
    isPackaged: true,
    pathApi: path.posix,
  }), "/user/role.png")
})
