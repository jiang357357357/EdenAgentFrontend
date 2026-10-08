const fs = require("node:fs")
const path = require("node:path")

const DATA_DIRECTORY_ERROR = "便携版数据目录不可用。请确认当前安装目录可写，且 Data/Desktop/Agent 及其父目录是普通目录，没有符号链接或目录重定向；修复后重新启动。"

function prepareDataDirectory(workspaceRoot, fileSystem, pathApi) {
  const root = fileSystem.realpathSync(workspaceRoot)
  if (!fileSystem.statSync(root).isDirectory()) throw new Error(DATA_DIRECTORY_ERROR)
  let directory = root
  for (const segment of ["Data", "Desktop", "Agent"]) {
    directory = pathApi.join(directory, segment)
    try {
      fileSystem.mkdirSync(directory, { mode: 0o700 })
    } catch (error) {
      if (error.code !== "EEXIST") throw error
    }
    const info = fileSystem.lstatSync(directory)
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(DATA_DIRECTORY_ERROR)
    const resolved = fileSystem.realpathSync(directory)
    const relative = pathApi.relative(root, resolved)
    if (relative === ".." || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative)) {
      throw new Error(DATA_DIRECTORY_ERROR)
    }
    directory = resolved
  }
  return directory
}

/** Call before creating services or Electron sessions; never import another installation's profile. */
function configurePortableDesktopData({ app, workspaceRoot, fileSystem = fs, pathApi = path } = {}) {
  if (!app?.isPackaged || !workspaceRoot) return undefined
  if (app.isReady?.()) throw new Error("便携版数据目录必须在桌面初始化前配置，请重新启动应用。")
  try {
    const directory = prepareDataDirectory(workspaceRoot, fileSystem, pathApi)
    app.setPath("userData", directory)
    app.setPath("sessionData", directory)
    return directory
  } catch {
    // Stop startup instead of silently sharing the global Electron profile.
    throw new Error(DATA_DIRECTORY_ERROR)
  }
}

module.exports = { configurePortableDesktopData }
