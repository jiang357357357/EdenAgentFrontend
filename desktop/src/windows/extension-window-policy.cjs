const path = require('node:path')
function isExtensionWindowUrl(raw, { isPackaged, devOrigin }) {
  try {
    const url = new URL(raw)
    return !url.search && !url.hash && url.pathname === '/extension-window.html' && (isPackaged
      ? url.protocol === 'edenagent:' && url.host === 'app'
      : url.origin === devOrigin)
  } catch { return false }
}
function extensionWindowDecision({ url, frameName }, options) {
  if (!/^eden-plugin-[0-9a-f-]{36}$/.test(frameName || '') || !isExtensionWindowUrl(url, options)) return null
  return { action: 'allow', outlivesOpener: false, overrideBrowserWindowOptions: {
    width: 1000, height: 720, minWidth: 400, minHeight: 300, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
      preload: path.join(__dirname, 'extension-window-preload.cjs') },
  } }
}
function attachExtensionChild(window, details, options, isQuitting) {
  if (!extensionWindowDecision(details, options)) return
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const guard = (event, url) => { if (!isExtensionWindowUrl(url, options)) event.preventDefault() }
  window.webContents.on('will-navigate', guard)
  window.webContents.on('will-redirect', guard)
  window.webContents.on('will-prevent-unload', event => { if (isQuitting()) event.preventDefault() })
}
module.exports = { isExtensionWindowUrl, extensionWindowDecision, attachExtensionChild }
