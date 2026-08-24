const assert = require("node:assert/strict")
const test = require("node:test")

const { DEFAULT_PET_SETTINGS, normalizePetSettings } = require("../src/pet/pet-settings.cjs")

test("pet settings clamp dimensions and normalize enum values", () => {
  const settings = normalizePetSettings({
    petScale: 260,
    inputOpacity: 5,
    inputWidth: 101,
    inputHeight: 8,
    inputFontScale: 20,
    dock: "invalid",
    inputMode: "invalid",
    windowX: "12.6",
    windowY: "not-a-number",
  })

  assert.equal(settings.petScale, 200)
  assert.equal(settings.inputOpacity, 30)
  assert.equal(settings.inputWidth, 100)
  assert.equal(settings.inputHeight, 12)
  assert.equal(settings.inputFontScale, 70)
  assert.equal(settings.dock, DEFAULT_PET_SETTINGS.dock)
  assert.equal(settings.inputMode, DEFAULT_PET_SETTINGS.inputMode)
  assert.equal(settings.windowX, 12.6)
  assert.equal(settings.windowY, null)
})

test("draggable characters cannot also be click-through", () => {
  const settings = normalizePetSettings({ characterDraggable: true, clickThrough: true })
  assert.equal(settings.characterDraggable, true)
  assert.equal(settings.clickThrough, false)
})

test("legacy speech synthesis maps to text-only TTS", () => {
  assert.equal(normalizePetSettings({ speechSynthesisEnabled: true }).ttsMode, "text_only")
})

test("voice devices and playback controls are normalized", () => {
  const settings = normalizePetSettings({
    audioInputDeviceId: " microphone-1 ",
    audioOutputDeviceId: "speaker-1",
    speechVolume: 140,
    speechRate: 0.2,
  })
  assert.equal(settings.audioInputDeviceId, "microphone-1")
  assert.equal(settings.audioOutputDeviceId, "speaker-1")
  assert.equal(settings.speechVolume, 100)
  assert.equal(settings.speechRate, 0.5)
})
