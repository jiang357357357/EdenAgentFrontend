const DEFAULT_PET_SETTINGS = Object.freeze({
  alwaysOnTop: true,
  transparentWindow: true,
  clickThrough: false,
  characterDraggable: false,
  showInput: true,
  voiceInputEnabled: true,
  ttsMode: "none",
  petScale: 100,
  inputOpacity: 78,
  dock: "center",
  inputMode: "compact",
  inputWidth: 78,
  inputHeight: 20,
  inputFontScale: 100,
  windowX: null,
  windowY: null,
})

function clampNumber(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

function normalizePetSettings(input = {}, defaults = DEFAULT_PET_SETTINGS) {
  const windowX = Number(input.windowX)
  const windowY = Number(input.windowY)
  const characterDraggable = Boolean(input.characterDraggable ?? defaults.characterDraggable)
  const showInput = Boolean(input.showInput ?? defaults.showInput)
  const clickThrough = !characterDraggable && Boolean(input.clickThrough ?? defaults.clickThrough)
  const legacyTTSMode = input.speechSynthesisEnabled === true ? "text_only" : "none"
  const ttsMode = ["none", "text_only", "all"].includes(input.ttsMode) ? input.ttsMode : legacyTTSMode
  return {
    alwaysOnTop: Boolean(input.alwaysOnTop ?? defaults.alwaysOnTop),
    transparentWindow: Boolean(input.transparentWindow ?? defaults.transparentWindow),
    clickThrough,
    characterDraggable,
    showInput,
    voiceInputEnabled: Boolean(input.voiceInputEnabled ?? defaults.voiceInputEnabled),
    ttsMode,
    petScale: clampNumber(input.petScale, defaults.petScale, 70, 200),
    inputOpacity: clampNumber(input.inputOpacity, defaults.inputOpacity, 30, 100),
    dock: ["left", "center", "right"].includes(input.dock) ? input.dock : defaults.dock,
    inputMode: ["compact", "panel", "hidden"].includes(input.inputMode) ? input.inputMode : defaults.inputMode,
    inputWidth: clampNumber(input.inputWidth, defaults.inputWidth, 10, 100),
    inputHeight: clampNumber(input.inputHeight, defaults.inputHeight, 12, 32),
    inputFontScale: clampNumber(input.inputFontScale, defaults.inputFontScale, 70, 140),
    windowX: Number.isFinite(windowX) ? windowX : null,
    windowY: Number.isFinite(windowY) ? windowY : null,
  }
}

module.exports = { DEFAULT_PET_SETTINGS, normalizePetSettings }
