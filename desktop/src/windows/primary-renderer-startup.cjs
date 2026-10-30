/** Start auxiliary work only after the primary React surface has painted. */
function attachPrimaryRendererStartup(targetWindow, { ipcMain, onReady }) {
  const contents = targetWindow.webContents
  let loaded = false, nativeReady = false, painted = false, finished = false

  const dispose = () => {
    ipcMain.removeListener('eden-agent:renderer-ready', rendererReady)
    contents.removeListener('did-finish-load', documentLoaded)
    contents.removeListener('did-start-navigation', navigationStarted)
    targetWindow.removeListener('ready-to-show', readyToShow)
    targetWindow.removeListener('closed', dispose)
  }
  const finish = () => {
    if (finished || !loaded || !nativeReady || !painted || targetWindow.isDestroyed() || contents.isDestroyed()) return
    finished = true
    dispose()
    // The primary renderer owns decision-window wakeups even while hidden in the tray.
    // Keep it active after startup so React effects do not wait for a visible frame.
    contents.setBackgroundThrottling(false)
    contents.invalidate()
    onReady()
  }
  const rendererReady = event => {
    if (event.sender !== contents || event.senderFrame !== contents.mainFrame) return
    painted = true
    finish()
  }
  const documentLoaded = () => { loaded = true; finish() }
  const readyToShow = () => { nativeReady = true; finish() }
  const navigationStarted = (event, _url, isInPlace, isMainFrame) => {
    const mainFrame = event.isMainFrame ?? isMainFrame
    const sameDocument = event.isSameDocument ?? isInPlace
    if (mainFrame && !sameDocument) { loaded = false; painted = false }
  }
  ipcMain.on('eden-agent:renderer-ready', rendererReady)
  contents.on('did-finish-load', documentLoaded)
  contents.on('did-start-navigation', navigationStarted)
  targetWindow.once('ready-to-show', readyToShow)
  targetWindow.once('closed', dispose)
  return dispose
}

module.exports = { attachPrimaryRendererStartup }
