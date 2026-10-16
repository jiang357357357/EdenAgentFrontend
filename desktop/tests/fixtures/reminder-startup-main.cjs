const assert = require('node:assert/strict')
const { app, BrowserWindow, ipcMain, screen } = require('electron')
const { createServer } = require('node:http')
const { readFile, writeFile } = require('node:fs/promises')
const path = require('node:path')
const { createDesktopReminderService } = require('../../src/reminders/reminder-service.cjs')
const { createReminderWindow } = require('../../src/reminders/reminder-window.cjs')
const { attachPrimaryRendererStartup } = require('../../src/windows/primary-renderer-startup.cjs')

const [scratch, mode] = process.argv.slice(2)
app.setPath('userData', path.join(scratch, 'profile'))
app.setPath('sessionData', path.join(scratch, 'session'))
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
async function until(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await check()) return
    await pause(10)
  }
  throw new Error('Startup fixture did not reach the expected state')
}

async function run() {
  const script = await readFile(path.join(scratch, 'renderer.js'))
  const http = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/renderer.js' ? 'text/javascript' : 'text/html; charset=utf-8')
    response.end(request.url === '/renderer.js' ? script
      : '<meta charset="utf-8"><div id="root"></div><script src="/renderer.js" defer></script>')
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${http.address().port}`
  const errors = [], warnings = [], created = [], trace = []
  let queued = true, reads = 0, ready = false, premature = false
  const options = { show: false, width: 960, height: 540, webPreferences: {
    preload: path.resolve(__dirname, '../../src/preload.cjs'), sandbox: true,
    nodeIntegration: false, contextIsolation: true, backgroundThrottling: false,
  } }
  const primary = new BrowserWindow(options), auxiliary = new BrowserWindow(options)
  primary.webContents.on('render-process-gone', (_event, details) => errors.push(details.reason))
  // All native surfaces remain hidden; the actual reminder DOM, preload and IPC still run.
  class HiddenReminderWindow extends BrowserWindow {
    showInactive() { trace.push('reminder-ready-to-show') }
  }
  const service = createDesktopReminderService({ BrowserWindow: HiddenReminderWindow, screen, ipcMain,
    coreToken: () => 'synthetic-account', retryIntervalMs: 15,
    logger: { warn: message => warnings.push(message) },
    rpcRequest: async (origin, method) => {
      if (origin === 'local') return []
      if (method === 'desktop.reminder.list') { reads++; return queued ? [{ id: 'synthetic-reminder', title: '启动提醒', message: '独立窗口临时夹具' }] : [] }
      if (method === 'desktop.reminder.close') queued = false
      return {}
    },
    createWindow: input => {
      if (!ready) premature = true
      const window = createReminderWindow(input)
      created.push(window)
      return window
    },
  })
  attachPrimaryRendererStartup(primary, { ipcMain, onReady: () => {
    ready = true; trace.push('primary-painted'); service.start()
  } })
  try {
    await Promise.all([primary.loadURL(url), auxiliary.loadURL(`${url}/?page=question`)])
    await auxiliary.webContents.executeJavaScript('window.mountStartupFixture(); window.edenAgentDesktop.rendererReady()')
    if (mode === 'baseline') service.start()
    await pause(250)
    const before = await primary.webContents.executeJavaScript("document.getElementById('root').childElementCount")
    assert.equal(before, 0)
    if (mode === 'fixed') { assert.equal(reads, 0); assert.equal(created.length, 0) }
    else await until(() => created.length === 1)
    await primary.webContents.executeJavaScript('window.mountStartupFixture()')
    await until(() => ready && created.length === 1)
    await until(async () => {
      try { return await created[0].webContents.executeJavaScript("document.getElementById('title')?.textContent === '启动提醒'") }
      catch { return false }
    })
    assert.equal(primary.webContents.getBackgroundThrottling(), true)
    assert.notEqual(primary.webContents.getOSProcessId(), created[0].webContents.getOSProcessId())
    await writeFile(path.join(scratch, 'primary.png'), (await primary.webContents.capturePage()).toPNG())
    await writeFile(path.join(scratch, 'reminder.png'), (await created[0].webContents.capturePage()).toPNG())
    const state = () => primary.webContents.executeJavaScript("({children:document.getElementById('root').childElementCount,text:document.querySelector('h1')?.textContent})")
    const beforeCrash = await state()
    created[0].webContents.forcefullyCrashRenderer()
    await until(() => created[0].isDestroyed() && created.length === 2)
    await until(async () => {
      try { return await created[1].webContents.executeJavaScript("document.getElementById('close')?.disabled === false") }
      catch { return false }
    })
    const afterCrash = await state()
    assert.deepEqual(afterCrash, beforeCrash)
    await created[1].webContents.executeJavaScript("document.getElementById('close').click()")
    await until(() => created[1].isDestroyed())
    const afterClose = await state()
    assert.deepEqual(afterClose, beforeCrash)
    const result = { mode, premature, before, beforeCrash, afterCrash, afterClose, errors, warnings, trace }
    assert.deepEqual(errors, [])
    process.stdout.write(`EDEN_STARTUP_RESULT=${JSON.stringify(result)}\n`)
  } finally {
    service.close(); primary.destroy(); auxiliary.destroy()
    http.closeAllConnections()
    await new Promise(resolve => http.close(resolve))
  }
}
app.whenReady().then(run).catch(error => {
  process.stderr.write(String(error.stack || error)); process.exitCode = 1
}).finally(() => app.quit())
