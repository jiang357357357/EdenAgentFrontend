function encodedDesktopCapture(captureSource, sourceKind, displayId) {
  if (!captureSource || captureSource.thumbnail.isEmpty()) return null
  const size = captureSource.thumbnail.getSize()
  return {
    dataUrl: captureSource.thumbnail.toDataURL(),
    mime: "image/png",
    width: size.width,
    height: size.height,
    displayId,
    sourceName: captureSource.name,
    source: sourceKind,
  }
}

function createDesktopCapture({ app, desktopCapturer, screen }) {
  async function captureGameWindow() {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const scaleFactor = Number(display.scaleFactor) || 1
    const thumbnailSize = {
      width: Math.max(1280, Math.round(display.size.width * scaleFactor)),
      height: Math.max(720, Math.round(display.size.height * scaleFactor)),
    }
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize,
      fetchWindowIcons: false,
    })
    const excluded = /edenagent|visual studio code|vscode|electron devtools|terminal|konsole|设置/i
    const strongGameHint = /victoria\s*3|vtu|gamescope|steam game|game preview|游戏|proton|wine/i
    const candidates = sources.filter(
      (item) => item?.name && !excluded.test(item.name) && !item.thumbnail.isEmpty(),
    )
    const source = candidates.find((item) => strongGameHint.test(item.name))
    if (!source) return null
    return encodedDesktopCapture(source, "game", `game-window:${source.id}`)
  }

  async function captureDesktopScreen(requestedSource = "auto") {
    if (!app.isReady()) throw new Error("桌面应用尚未就绪，无法截屏")
    const sourceMode = String(requestedSource || "auto").trim().toLowerCase()
    if (!["auto", "desktop", "game"].includes(sourceMode)) {
      throw new Error("截图来源无效，只支持 auto、desktop 或 game")
    }
    if (sourceMode !== "desktop") {
      const gameCapture = await captureGameWindow()
      if (gameCapture) return gameCapture
      if (sourceMode === "game") {
        throw new Error("当前没有检测到可截取的 VTU、Gamescope 或游戏窗口")
      }
    }

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const scaleFactor = Number(display.scaleFactor) || 1
    const thumbnailSize = {
      width: Math.max(1, Math.round(display.size.width * scaleFactor)),
      height: Math.max(1, Math.round(display.size.height * scaleFactor)),
    }
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize,
      fetchWindowIcons: false,
    })
    const displayID = String(display.id)
    const source =
      sources.find((item) => String(item.display_id || "") === displayID) ||
      sources.find((item) => String(item.id || "").includes(`:${displayID}:`)) ||
      sources[0]
    if (!source || source.thumbnail.isEmpty()) {
      throw new Error("Electron 未能获取当前显示器截图；请检查系统的屏幕捕获权限")
    }
    return encodedDesktopCapture(source, "desktop", displayID)
  }

  return { captureDesktopScreen, captureGameWindow }
}

module.exports = { createDesktopCapture, encodedDesktopCapture }
