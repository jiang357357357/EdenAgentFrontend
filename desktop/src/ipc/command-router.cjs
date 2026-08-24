function createDesktopCommandRouter(handlers) {
  if (!handlers || typeof handlers !== "object") throw new TypeError("handlers are required")
  return async function routeDesktopCommand(event, command, args = {}) {
    const handler = Object.prototype.hasOwnProperty.call(handlers, command) ? handlers[command] : null
    if (typeof handler !== "function") throw new Error(`未知桌面命令: ${command}`)
    return handler({ event, sender: event.sender, args: args ?? {} })
  }
}

function registerDesktopIpc({ ipcMain, handlers, channel = "eden-agent:invoke" } = {}) {
  if (!ipcMain?.handle) throw new TypeError("ipcMain.handle is required")
  const router = createDesktopCommandRouter(handlers)
  ipcMain.handle(channel, router)
  return router
}

module.exports = { createDesktopCommandRouter, registerDesktopIpc }
