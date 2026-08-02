function createFallbackTrayIcon(nativeImage) {
  const size = 32
  const canvas = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - 15.5
      const dy = y - 15.5
      const distance = Math.sqrt(dx * dx + dy * dy)
      const inside = distance <= 14
      const ring = distance >= 9.5 && distance <= 12.5
      const offset = (y * size + x) * 4
      const rgba = !inside ? [0, 0, 0, 0] : ring ? [255, 148, 28, 255] : [24, 24, 27, 255]
      canvas[offset] = rgba[2]
      canvas[offset + 1] = rgba[1]
      canvas[offset + 2] = rgba[0]
      canvas[offset + 3] = rgba[3]
    }
  }
  return nativeImage.createFromBitmap(canvas, { width: size, height: size })
}

function createTrayController({
  Menu,
  Tray,
  nativeImage,
  platform = process.platform,
  title,
  resolveDesktopIconPath,
  getMainWindow,
  getPetWindow,
  hidePetWindows,
  createPetWindow,
  createSettingsWindow,
  onQuit,
} = {}) {
  let tray = null

  function createDesktopIcon() {
    const iconPath = resolveDesktopIconPath()
    if (iconPath) {
      const icon = nativeImage.createFromPath(iconPath)
      if (!icon.isEmpty()) return platform === "linux" ? icon.resize({ width: 24, height: 24 }) : icon
    }
    return createFallbackTrayIcon(nativeImage)
  }

  function isPetWindowVisible() {
    const petWindow = getPetWindow()
    return Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible())
  }

  function updateTray() {
    if (!tray) return false
    const petVisible = isPetWindowVisible()
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "显示主窗口", click: () => getMainWindow()?.show() },
      { label: "隐藏主窗口", click: () => getMainWindow()?.hide() },
      { type: "separator" },
      {
        label: petVisible ? "隐藏桌宠" : "显示桌宠",
        click: () => {
          if (isPetWindowVisible()) hidePetWindows()
          else void createPetWindow()
        },
      },
      { label: "设置", click: () => { void createSettingsWindow() } },
      { type: "separator" },
      { label: "退出", click: onQuit },
    ]))
    return true
  }

  function createTray() {
    tray = new Tray(createDesktopIcon())
    tray.setToolTip(title)
    tray.on("click", () => getMainWindow()?.show())
    updateTray()
    return tray
  }

  return { createTray, isPetWindowVisible, updateTray }
}

module.exports = { createFallbackTrayIcon, createTrayController }
