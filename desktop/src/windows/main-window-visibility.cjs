/** Publish only native primary-window appearance changes, never ordinary focus. */
function attachMainWindowVisibility(targetWindow, { ipcMain }) {
  const contents = targetWindow.webContents
  const channel = 'eden-agent-main-window-visibility'
  const subscription = 'eden-agent:main-window-visibility-subscribe'
  let lastVisible, disposed = false
  const publish = force => {
    if (disposed || targetWindow.isDestroyed() || contents.isDestroyed()) return
    const visible = targetWindow.isVisible() && !targetWindow.isMinimized()
    if (!force && visible === lastVisible) return
    lastVisible = visible
    contents.send(channel, visible)
  }
  const changed = () => publish(false)
  const subscribe = event => {
    if (event.sender === contents && event.senderFrame === contents.mainFrame) publish(true)
  }
  const events = ['show', 'hide', 'minimize', 'restore']
  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const event of events) targetWindow.removeListener(event, changed)
    ipcMain.removeListener(subscription, subscribe)
    contents.removeListener('destroyed', dispose)
    targetWindow.removeListener('closed', dispose)
  }
  for (const event of events) targetWindow.on(event, changed)
  ipcMain.on(subscription, subscribe)
  contents.once('destroyed', dispose)
  targetWindow.once('closed', dispose)
  return dispose
}

module.exports = { attachMainWindowVisibility }
