const path = require('node:path')
const { reminderLayout } = require('./reminder-layout.cjs')

function createReminderWindow({ BrowserWindow, screen, ipcMain, origin, reminder, acknowledge, displayed, onClosed }) {
  const display = screen.getDisplayNearestPoint?.(screen.getCursorScreenPoint()) ?? screen.getPrimaryDisplay()
  const initial = reminderLayout(display.workArea, origin)
  const window = new BrowserWindow({ width: initial.width, height: initial.minHeight, useContentSize: true,
    show: false, alwaysOnTop: true, skipTaskbar: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#faf9f6', title: 'Eden · 角色提醒',
    webPreferences: { preload: path.join(__dirname, 'reminder-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  const outer = window.getBounds(), inner = window.getContentBounds()
  const layout = reminderLayout(display.workArea, origin, { width: outer.width - inner.width, height: outer.height - inner.height })
  window.setBounds(layout.bounds(layout.minHeight))
  let closing = false, acknowledged = false
  const dismiss = async () => {
    if (closing || window.isDestroyed()) return
    closing = true
    try { await acknowledge(); acknowledged = true; if (!window.isDestroyed()) window.destroy() }
    catch { if (!window.isDestroyed()) window.webContents.send('eden-reminder:error', '未能保存关闭状态，请稍后重试。') }
    finally { closing = false }
  }
  const requestClose = event => { if (event.sender === window.webContents) void dismiss() }
  const resize = (event, height) => {
    if (event.sender !== window.webContents || window.isDestroyed() || !Number.isFinite(height) || height < 0) return
    window.setBounds(layout.bounds(height))
  }
  ipcMain.on('eden-reminder:close', requestClose)
  ipcMain.on('eden-reminder:resize', resize)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.once('did-finish-load', () => window.webContents.send('eden-reminder:content', {
    title: reminder.title, message: reminder.message, world: origin === 'mon' ? '伊甸园' : '尘世', maxHeight: layout.maxHeight,
  }))
  window.once('ready-to-show', () => {
    window.showInactive()
    void displayed().catch(() => {
      if (!window.isDestroyed()) window.webContents.send('eden-reminder:error', '提示已显示，但未能保存显示状态，请稍后重试。')
    })
  })
  window.on('close', event => { if (!acknowledged) { event.preventDefault(); void dismiss() } })
  window.on('closed', () => {
    ipcMain.removeListener('eden-reminder:close', requestClose)
    ipcMain.removeListener('eden-reminder:resize', resize)
    onClosed()
  })
  void window.loadFile(path.join(__dirname, 'reminder.html')).catch(() => { if (!window.isDestroyed()) window.destroy() })
  return window
}
module.exports = { createReminderWindow }
