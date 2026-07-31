import assert from "node:assert/strict"
import test from "node:test"

import { captureCameraFrame } from "../src/lib/camera-frame.ts"

function installCameraEnvironment({ contextAvailable = true } = {}) {
  const originalNavigator = globalThis.navigator
  const originalDocument = globalThis.document
  const originalMedia = globalThis.HTMLMediaElement
  let stopped = false
  let drawn = false
  const track = {
    label: "Test Camera",
    getSettings: () => ({ facingMode: "user" }),
    stop: () => {
      stopped = true
    },
  }
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  }
  const video = {
    autoplay: false,
    muted: false,
    playsInline: false,
    srcObject: null,
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
    play: async () => {},
    pause: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => contextAvailable
      ? {
          drawImage: () => {
            drawn = true
          },
        }
      : null,
    toDataURL: () => "data:image/jpeg;base64,Y2FtZXJh",
  }
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => stream,
      },
    },
  })
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag) => tag === "video" ? video : canvas,
    },
  })
  Object.defineProperty(globalThis, "HTMLMediaElement", {
    configurable: true,
    value: { HAVE_CURRENT_DATA: 2 },
  })

  return {
    drawn: () => drawn,
    stopped: () => stopped,
    restore() {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator })
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument })
      Object.defineProperty(globalThis, "HTMLMediaElement", { configurable: true, value: originalMedia })
    },
  }
}

test("captures one camera frame and stops the media track", async () => {
  const environment = installCameraEnvironment()
  try {
    const result = await captureCameraFrame("user")
    assert.equal(result.mime, "image/jpeg")
    assert.equal(result.width, 640)
    assert.equal(result.height, 480)
    assert.equal(result.deviceLabel, "Test Camera")
    assert.equal(environment.drawn(), true)
    assert.equal(environment.stopped(), true)
  } finally {
    environment.restore()
  }
})

test("stops the media track when snapshot creation fails", async () => {
  const environment = installCameraEnvironment({ contextAvailable: false })
  try {
    await assert.rejects(() => captureCameraFrame("user"), /无法创建摄像头快照/)
    assert.equal(environment.stopped(), true)
  } finally {
    environment.restore()
  }
})
