function createWindowCommandHandlers({ BrowserWindow, dialog, getMainWindow, shell } = {}) {
  const senderWindow = (sender) => BrowserWindow.fromWebContents(sender)
  return {
    select_skill_directory: async ({ sender }) => {
      const targetWindow = senderWindow(sender) ?? getMainWindow()
      const result = await dialog.showOpenDialog(targetWindow, {
        title: "选择技能目录",
        properties: ["openDirectory"],
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    select_workspace_directory: async ({ sender, args }) => {
      const targetWindow = senderWindow(sender) ?? getMainWindow()
      const result = await dialog.showOpenDialog(targetWindow, {
        title: "选择项目文件夹",
        defaultPath: args?.path || undefined,
        properties: ["openDirectory"],
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    open_workspace_directory: async ({ args }) => {
      const target = String(args?.path || "").trim()
      if (!target || !shell?.openPath) return false
      return (await shell.openPath(target)) === ""
    },
    start_window_drag: () => true,
    close_current_window: ({ sender }) => {
      senderWindow(sender)?.close()
      return true
    },
    minimize_current_window: ({ sender }) => {
      senderWindow(sender)?.minimize()
      return true
    },
    toggle_maximize_current_window: ({ sender }) => {
      const targetWindow = senderWindow(sender)
      if (!targetWindow) return false
      if (targetWindow.isMaximized()) targetWindow.unmaximize()
      else targetWindow.maximize()
      return true
    },
  }
}

module.exports = { createWindowCommandHandlers }
