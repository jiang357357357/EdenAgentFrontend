const { inspectSpineDirectory } = require("../app/local-character-assets.cjs")

function createWindowCommandHandlers({ BrowserWindow, dialog, getMainWindow, shell, inspectSpine = inspectSpineDirectory } = {}) {
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
    select_character_image: async ({ sender }) => {
      const targetWindow = senderWindow(sender) ?? getMainWindow()
      const result = await dialog.showOpenDialog(targetWindow, {
        title: "选择角色头像",
        properties: ["openFile"],
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    select_character_standing_image: async ({ sender }) => {
      const targetWindow = senderWindow(sender) ?? getMainWindow()
      const result = await dialog.showOpenDialog(targetWindow, {
        title: "选择静态立绘",
        properties: ["openFile"],
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    },
    select_character_spine_directory: async ({ sender }) => {
      const targetWindow = senderWindow(sender) ?? getMainWindow()
      const result = await dialog.showOpenDialog(targetWindow, {
        title: "选择 Spine 资源目录",
        properties: ["openDirectory"],
      })
      const directory = result.canceled ? null : result.filePaths[0] ?? null
      return directory ? inspectSpine(directory) : null
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
