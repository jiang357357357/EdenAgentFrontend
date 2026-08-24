const path = require("node:path")

function createWebAppLoader({
  app,
  shell,
  frontendRoot,
  getWebPort,
  defaultWebPort,
  isInternalAppUrl,
  isSupportedExternalUrl,
  logger = console,
  pathApi = path,
} = {}) {
  if (!app) throw new TypeError("app is required")
  if (!shell?.openExternal) throw new TypeError("shell.openExternal is required")
  if (!frontendRoot) throw new TypeError("frontendRoot is required")
  if (typeof getWebPort !== "function") throw new TypeError("getWebPort is required")

  const appEntryFile = pathApi.join(frontendRoot, "web", "dist", "index.html")

  function resolveWebUrl(page) {
    const configuredPort = Number(getWebPort())
    const webPort = Number.isFinite(configuredPort) ? configuredPort : defaultWebPort
    const devUrl = `http://127.0.0.1:${webPort}`
    if (!page) return devUrl
    const url = new URL(devUrl)
    url.searchParams.set("page", page)
    return url.toString()
  }

  function navigationPolicyOptions() {
    return {
      isPackaged: app.isPackaged,
      appEntryFile,
      devOrigin: new URL(resolveWebUrl()).origin,
    }
  }

  function openExternalNavigation(url) {
    if (!isSupportedExternalUrl(url)) {
      logger.warn(`[Eden Agent][Desktop] 已阻止不受支持的外部导航: ${url}`)
      return false
    }
    void shell.openExternal(url).catch((error) => {
      logger.warn(`[Eden Agent][Desktop] 无法使用系统浏览器打开链接: ${url}`, error)
    })
    return true
  }

  function attachNavigationPolicy(targetWindow) {
    const contents = targetWindow.webContents
    const isInternal = (url) => isInternalAppUrl(url, navigationPolicyOptions())

    contents.setWindowOpenHandler(({ url }) => {
      if (!isInternal(url)) openExternalNavigation(url)
      return { action: "deny" }
    })

    const guardMainFrameNavigation = (event, url) => {
      if (isInternal(url)) return
      event.preventDefault()
      openExternalNavigation(url)
    }
    contents.on("will-navigate", guardMainFrameNavigation)
    contents.on("will-redirect", guardMainFrameNavigation)
  }

  function loadWebApp(targetWindow, page) {
    attachNavigationPolicy(targetWindow)
    if (app.isPackaged) {
      const options = page ? { query: { page } } : undefined
      targetWindow.loadFile(appEntryFile, options)
    } else {
      targetWindow.loadURL(resolveWebUrl(page))
    }
  }

  return { attachNavigationPolicy, loadWebApp, navigationPolicyOptions, openExternalNavigation, resolveWebUrl }
}

module.exports = { createWebAppLoader }
