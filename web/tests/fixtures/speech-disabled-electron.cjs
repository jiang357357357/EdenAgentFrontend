const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const directory = process.env.EDEN_SPEECH_FIXTURE_DIRECTORY
app.setPath('userData', path.join(directory, 'user-data'))
app.setPath('sessionData', path.join(directory, 'user-data'))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } })
  await win.loadFile(path.join(directory, 'index.html'))
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const result = await win.webContents.executeJavaScript('window.speechFixture')
    if (result?.done) {
      fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result))
      win.destroy()
      app.exit(0)
      return
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Speech fixture timed out')
}).catch(error => {
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ error: String(error.stack || error) }))
  app.exit(1)
})
