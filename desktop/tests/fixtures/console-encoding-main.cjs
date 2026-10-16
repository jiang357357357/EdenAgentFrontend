const { app, BrowserWindow, ipcMain } = require("electron")
const { writeFileSync } = require("node:fs")
const path = require("node:path")
const { registerDesktopIpc } = require("../../src/ipc/command-router.cjs")

const scratch = process.argv[2]
const message = "请求 MonCore 接口失败: fetch failed；中文路径与表情 😊"
app.setPath("userData", path.join(scratch, "user-data"))
app.setPath("sessionData", path.join(scratch, "session-data"))

app.whenReady().then(async () => {
  registerDesktopIpc({ ipcMain, handlers: {
    fail: () => { throw new Error(message) },
    success: ({ args }) => args,
  } })
  const window = new BrowserWindow({ show: false, webPreferences: {
    preload: path.resolve(__dirname, "../../src/preload.cjs"),
    contextIsolation: true, nodeIntegration: false, sandbox: true,
  } })
  try {
    await window.loadURL('data:text/html;charset=utf-8,<meta charset="utf-8">')
    const received = await window.webContents.executeJavaScript(`window.edenAgentDesktop.invoke('fail').catch(error => error.message)`)
    const success = await window.webContents.executeJavaScript(`window.edenAgentDesktop.invoke('success', { text: ${JSON.stringify(message)} })`)
    const result = { version: process.versions.electron, original: message, received, success }
    writeFileSync(path.join(scratch, "result.json"), JSON.stringify(result, null, 2), "utf8")
    process.stdout.write(`EDEN_ENCODING_RESULT=${JSON.stringify(result)}\n`)
  } finally { window.destroy() }
}).catch(error => {
  process.stderr.write(String(error.stack || error))
  process.exitCode = 1
}).finally(() => app.quit())
