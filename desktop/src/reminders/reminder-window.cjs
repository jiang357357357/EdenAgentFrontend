const path = require('node:path')

function createReminderWindow({ BrowserWindow, screen, ipcMain, origin, reminder, acknowledge, displayed, onClosed }) {
  const bounds = screen.getPrimaryDisplay().workArea
  const window = new BrowserWindow({ width: 380, height: 300, x: bounds.x + bounds.width - 400, y: Math.max(bounds.y, bounds.y + bounds.height - (origin === 'local' ? 640 : 320)),
    show: false, alwaysOnTop: true, skipTaskbar: false, resizable: false, title: origin === 'mon' ? '伊甸园 · 角色提醒' : '尘世 · 角色提醒',
    webPreferences: { preload: path.join(__dirname, 'reminder-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  let closing = false, acknowledged = false
  const dismiss = async () => {
    if (closing || window.isDestroyed()) return
    closing = true
    try { await acknowledge(); acknowledged = true; if (!window.isDestroyed()) window.destroy() }
    catch { if (!window.isDestroyed()) window.webContents.send('eden-reminder:error', '未能保存关闭状态，请稍后重试。') }
    finally { closing = false }
  }
  const requestClose = event => { if (event.sender === window.webContents) void dismiss() }
  ipcMain.on('eden-reminder:close', requestClose)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.once('did-finish-load', () => window.webContents.send('eden-reminder:content', {
    title: reminder.title, message: reminder.message, world: origin === 'mon' ? '伊甸园' : '尘世',
  }))
  window.once('ready-to-show', () => { window.showInactive(); void displayed().catch(() => {}) })
  window.on('close', event => { if (!acknowledged) { event.preventDefault(); void dismiss() } })
  window.on('closed', () => { ipcMain.removeListener('eden-reminder:close', requestClose); onClosed() })
  void window.loadFile(path.join(__dirname, 'reminder.html')).catch(() => { if (!window.isDestroyed()) window.destroy() })
  return window
}
module.exports = { createReminderWindow }
