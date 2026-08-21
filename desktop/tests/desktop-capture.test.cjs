const assert = require("node:assert/strict")
const test = require("node:test")

const { createDesktopCapture, encodedDesktopCapture } = require("../src/media/desktop-capture.cjs")

function thumbnail({ empty = false, width = 1280, height = 720 } = {}) {
  return {
    isEmpty: () => empty,
    getSize: () => ({ width, height }),
    toDataURL: () => "data:image/png;base64,AAAA",
  }
}

test("encodedDesktopCapture maps thumbnail metadata", () => {
  assert.deepEqual(
    encodedDesktopCapture({ name: "Screen", thumbnail: thumbnail() }, "desktop", "1"),
    {
      dataUrl: "data:image/png;base64,AAAA",
      mime: "image/png",
      width: 1280,
      height: 720,
      displayId: "1",
      sourceName: "Screen",
      source: "desktop",
    },
  )
})

test("desktop capture prefers a detected game window in auto mode", async () => {
  const requests = []
  const desktopCapturer = {
    async getSources(options) {
      requests.push(options)
      return [{ id: "window:7", name: "Steam Game", thumbnail: thumbnail() }]
    },
  }
  const screen = {
    getCursorScreenPoint: () => ({ x: 10, y: 20 }),
    getDisplayNearestPoint: () => ({ id: 1, scaleFactor: 1, size: { width: 1920, height: 1080 } }),
  }
  const capture = createDesktopCapture({ app: { isReady: () => true }, desktopCapturer, screen })

  const result = await capture.captureDesktopScreen("auto")

  assert.equal(result.source, "game")
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].types, ["window"])
})

test("desktop capture recognizes a Victoria 3 window", async () => {
  const desktopCapturer = {
    async getSources() {
      return [{ id: "window:9", name: "Victoria 3", thumbnail: thumbnail() }]
    },
  }
  const screen = {
    getCursorScreenPoint: () => ({ x: 10, y: 20 }),
    getDisplayNearestPoint: () => ({ id: 1, scaleFactor: 1, size: { width: 1920, height: 1080 } }),
  }
  const capture = createDesktopCapture({ app: { isReady: () => true }, desktopCapturer, screen })

  const result = await capture.captureDesktopScreen("game")

  assert.equal(result.source, "game")
  assert.equal(result.sourceName, "Victoria 3")
})

test("desktop capture falls back to the current display", async () => {
  const desktopCapturer = {
    async getSources(options) {
      if (options.types[0] === "window") return []
      return [{ id: "screen:2:0", display_id: "2", name: "Display 2", thumbnail: thumbnail() }]
    },
  }
  const screen = {
    getCursorScreenPoint: () => ({ x: 10, y: 20 }),
    getDisplayNearestPoint: () => ({ id: 2, scaleFactor: 1, size: { width: 1920, height: 1080 } }),
  }
  const capture = createDesktopCapture({ app: { isReady: () => true }, desktopCapturer, screen })

  const result = await capture.captureDesktopScreen("auto")

  assert.equal(result.source, "desktop")
  assert.equal(result.displayId, "2")
})
