/** Refresh the complete surface after native window state changes. */
function attachWindowRepaint(targetWindow, { schedule = setImmediate, cancel = clearImmediate } = {}) {
  const contents = targetWindow.webContents
  const events = ["resize", "maximize", "unmaximize", "restore", "show"]
  let pending = null
  let disposed = false
  const request = () => {
    if (disposed || pending !== null) return
    pending = schedule(() => {
      pending = null
      if (disposed || targetWindow.isDestroyed() || contents.isDestroyed() || targetWindow.isMinimized()) return
      contents.invalidate()
    })
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    if (pending !== null) cancel(pending)
    pending = null
    for (const event of events) targetWindow.removeListener(event, request)
    contents.removeListener("did-finish-load", request)
    targetWindow.removeListener("closed", dispose)
  }
  for (const event of events) targetWindow.on(event, request)
  contents.on("did-finish-load", request)
  targetWindow.once("closed", dispose)
  return dispose
}

module.exports = { attachWindowRepaint }
