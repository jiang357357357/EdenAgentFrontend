const path = require('node:path')
const { readControlPlacement, controlBounds, saveControlPlacement } = require('./control-layout.cjs')
const CHANNEL = 'eden-desktop-control:command'
const STATE = 'eden-desktop-control:state'

function createDesktopControlWindow({ BrowserWindow, screen, ipcMain, placementFile, control, dismiss, onClosed, logger = console }) {
  const placement = readControlPlacement(placementFile)
  const window = new BrowserWindow({ ...controlBounds(screen, placement), show: false, frame: false,
    title: 'Eden · 桌面控制', alwaysOnTop: placement.topmost, skipTaskbar: true, resizable: false,
    minimizable: false, maximizable: false, fullscreenable: false, backgroundColor: '#fffaf0',
    webPreferences: { preload: path.join(__dirname, 'control-preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, partition: 'eden-desktop-control' } })
  let state = {}, ready = false, visible = false, destroyed = false, pendingSave
  function send() { if (!window.isDestroyed()) window.webContents.send(STATE, { ...state, topmost: placement.topmost }) }
  function save() {
    if (window.isDestroyed()) return
    const { x, y } = window.getBounds()
    try { saveControlPlacement(placementFile, { x, y, topmost: placement.topmost }) }
    catch (error) { logger.warn('[Eden Agent][Desktop Control] 无法保存浮窗位置', error.message) }
  }
  function constrain() {
    if (window.isDestroyed()) return
    const current = window.getBounds(), next = controlBounds(screen, current)
    if (Object.keys(next).some(key => current[key] !== next[key])) window.setBounds(next, false)
  }
  async function command(event, action) {
    if (event.sender !== window.webContents) throw new Error('桌面控制窗口来源不匹配')
    if (action === 'pin') {
      placement.topmost = !placement.topmost; window.setAlwaysOnTop(placement.topmost); save(); send(); return
    }
    if (action === 'close') return dismiss()
    if (!['pause', 'resume', 'stop'].includes(action)) throw new Error('未知桌面控制动作')
    return control(action)
  }
  ipcMain.handle(CHANNEL, command)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.on('did-finish-load', () => { ready = true; send(); if (visible) window.showInactive() })
  window.webContents.on('render-process-gone', () => { if (!window.isDestroyed()) window.destroy() })
  window.on('close', event => { if (!destroyed) { event.preventDefault(); void dismiss().catch(() => {}) } })
  window.on('moved', () => { clearTimeout(pendingSave); pendingSave = setTimeout(save, 200) })
  screen.on('display-removed', constrain); screen.on('display-metrics-changed', constrain)
  window.on('closed', () => {
    clearTimeout(pendingSave); ipcMain.removeHandler(CHANNEL)
    screen.removeListener('display-removed', constrain); screen.removeListener('display-metrics-changed', constrain)
    onClosed()
  })
  void window.loadFile(path.join(__dirname, 'control.html')).catch(error => {
    logger.warn('[Eden Agent][Desktop Control] 浮窗加载失败', error.message)
    if (!window.isDestroyed()) window.destroy()
  })
  return {
    window,
    update(value) { state = value; if (ready) send() },
    show() { const changed = !visible; visible = true; constrain(); if (changed && ready && !window.isDestroyed()) window.showInactive() },
    hide() { visible = false; if (!window.isDestroyed()) window.hide() },
    close() { destroyed = true; save(); if (!window.isDestroyed()) window.destroy() },
  }
}
module.exports = { createDesktopControlWindow }
