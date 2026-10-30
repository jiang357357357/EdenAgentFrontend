function createQuestionWindowController({ BrowserWindow, screen, preload, resolveIcon, load, attach, quitting, owner }) {
  let window = null
  function create() {
    if (window && !window.isDestroyed()) return window
    const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const target = new BrowserWindow({ title: 'Eden Agent 用户决策',
      width: Math.round(workArea.width * 0.36), height: Math.round(workArea.height * 0.72),
      minWidth: Math.round(workArea.width * 0.28), minHeight: Math.round(workArea.height * 0.5),
      center: true, show: false, frame: true, autoHideMenuBar: true, alwaysOnTop: true, skipTaskbar: false,
      backgroundColor: '#f5f5f4', icon: resolveIcon(),
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true,
        webSecurity: false, backgroundThrottling: false },
    })
    window = target
    target.on('close', event => { if (!quitting()) { event.preventDefault(); target.hide() } })
    target.on('closed', () => { if (window === target) window = null })
    attach(target)
    target.webContents.on('render-process-gone', () => { if (!target.isDestroyed()) target.destroy() })
    load(target)
    return target
  }
  return {
    create,
    setVisible(sender, visible) {
      if (!owner() || sender !== owner()) throw new Error('只有主窗口可以控制问题窗口显示')
      if (!visible) { if (window && !window.isDestroyed()) window.hide(); return true }
      const target = create()
      if (target.isMinimized()) target.restore()
      target.setAlwaysOnTop(true); target.show(); target.focus()
      return true
    },
  }
}
module.exports = { createQuestionWindowController }
