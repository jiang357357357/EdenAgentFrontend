const assert = require("node:assert/strict")
const test = require("node:test")

const { createFallbackTrayIcon, createTrayController } = require("../src/windows/tray-controller.cjs")

test("fallback tray icon creates a 32 pixel bitmap", () => {
  let bitmap = null
  const icon = { fallback: true }
  const result = createFallbackTrayIcon({
    createFromBitmap(data, options) {
      bitmap = { data, options }
      return icon
    },
  })
  assert.equal(result, icon)
  assert.equal(bitmap.data.length, 32 * 32 * 4)
  assert.deepEqual(bitmap.options, { width: 32, height: 32 })
})

test("tray controller builds menus from current window state", async () => {
  let petVisible = true
  let menuTemplate = null
  const calls = []
  const mainWindow = { show: () => calls.push("show-main"), hide: () => calls.push("hide-main") }
  const petWindow = {
    isDestroyed: () => false,
    isVisible: () => petVisible,
  }
  class FakeTray {
    constructor(icon) { this.icon = icon; this.handlers = new Map() }
    setToolTip(value) { this.tooltip = value }
    setContextMenu(value) { this.menu = value }
    on(event, handler) { this.handlers.set(event, handler) }
  }
  const nativeIcon = { isEmpty: () => false }
  const controller = createTrayController({
    Menu: { buildFromTemplate: (template) => { menuTemplate = template; return template } },
    Tray: FakeTray,
    nativeImage: { createFromPath: () => nativeIcon },
    platform: "win32",
    title: "Eden Agent",
    resolveDesktopIconPath: () => "D:\\Mon\\icon.ico",
    getMainWindow: () => mainWindow,
    getPetWindow: () => petWindow,
    hidePetWindows: () => { petVisible = false; calls.push("hide-pet") },
    createPetWindow: async () => { petVisible = true; calls.push("show-pet") },
    createSettingsWindow: async () => calls.push("settings"),
    onQuit: () => calls.push("quit"),
  })

  const tray = controller.createTray()
  assert.equal(tray.icon, nativeIcon)
  assert.equal(tray.tooltip, "Eden Agent")
  assert.equal(menuTemplate[3].label, "隐藏桌宠")
  tray.handlers.get("click")()
  menuTemplate[0].click()
  menuTemplate[1].click()
  menuTemplate[3].click()
  menuTemplate[4].click()
  menuTemplate[6].click()
  await Promise.resolve()
  assert.deepEqual(calls, ["show-main", "show-main", "hide-main", "hide-pet", "settings", "quit"])

  controller.updateTray()
  assert.equal(menuTemplate[3].label, "显示桌宠")
  menuTemplate[3].click()
  await Promise.resolve()
  assert.equal(calls.at(-1), "show-pet")
})
