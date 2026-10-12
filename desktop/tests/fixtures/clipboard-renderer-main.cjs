const { app, BrowserWindow, ipcMain, session } = require("electron")
const { createServer } = require("node:http")
const { readFile } = require("node:fs/promises")
const path = require("node:path")
const { registerDesktopIpc } = require("../../src/ipc/command-router.cjs")
const { createClipboardCommandHandlers } = require("../../src/ipc/clipboard-command-handlers.cjs")
const { isInternalAppUrl } = require("../../src/protocols/navigation-policy.cjs")
const { registerMediaPermissions } = require("../../src/permissions/register-media-permissions.cjs")

const scratch = process.argv[2]
app.setPath("userData", path.join(scratch, "user-data"))

async function run() {
  const writes = []
  const script = await readFile(path.join(scratch, "renderer.js"))
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", request.url === "/renderer.js" ? "text/javascript" : "text/html; charset=utf-8")
    response.end(request.url === "/renderer.js" ? script : '<!doctype html><html><meta charset="utf-8"><body><script src="/renderer.js"></script></body></html>')
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const window = new BrowserWindow({ show: false, webPreferences: {
    preload: path.resolve(__dirname, "../../src/preload.cjs"),
    contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
  } })
  registerMediaPermissions({ defaultSession: session.defaultSession, BrowserWindow,
    getMainWindow: () => window, getPetBubbleWindow: () => null })
  // Keep the user's OS clipboard intact; exercise the real preload, IPC, permissions and UI.
  registerDesktopIpc({ ipcMain, handlers: createClipboardCommandHandlers({
    clipboard: { writeText: text => writes.push(text) }, getWindows: () => [window],
    isInternalUrl: url => isInternalAppUrl(url, { isPackaged: false, devOrigin: origin }),
  }) })
  try {
    await window.loadURL(origin)
    const result = await window.webContents.executeJavaScript("window.runDesktopClipboardTests()", true)
    process.stdout.write("EDEN_CLIPBOARD_RESULT=" + JSON.stringify({ ...result, writes }) + "\n")
  } finally {
    window.destroy()
    await new Promise(resolve => server.close(resolve))
  }
}

app.whenReady().then(run).catch(error => {
  process.stderr.write(String(error.stack || error))
  process.exitCode = 1
}).finally(() => app.quit())
