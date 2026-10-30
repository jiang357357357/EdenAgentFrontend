const assert = require('node:assert/strict')
const { app, BrowserWindow, ipcMain, screen } = require('electron')
const { mkdir, readFile, writeFile } = require('node:fs/promises')
const path = require('node:path')
const { createDesktopControlService } = require('../../src/desktop-control/control-service.cjs')
const { createDesktopControlWindow } = require('../../src/desktop-control/control-window.cjs')

const [scratch, evidence] = process.argv.slice(2)
app.setPath('userData', path.join(scratch, 'profile'))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check) {
  for (let n = 0; n < 200; n++) {
    try { if (await check()) return } catch { /* Wait for the actual document and IPC state. */ }
    await pause(15)
  }
  throw new Error('Floating control fixture did not reach expected state')
}

async function run() {
  await mkdir(evidence, { recursive: true })
  const windows = [], calls = [], errors = [], trace = []
  const status = { available: true, busy: true, paused: false, stopped: false, observerAvailable: true,
    control: undefined,
    operations: [{ sessionId: 'private-fixture-id', action: 'desktop_type', windowTitle: '临时应用 · 正在填写表单', state: 'running', startedAt: 1 }] }
  let failControl = false
  class HiddenControlWindow extends BrowserWindow {
    constructor(options) { super({ ...options, webPreferences: { ...options.webPreferences, offscreen: true, backgroundThrottling: false } }); windows.push(this);
      this.frameSerial = 0
      this.webContents.on('paint', (_event, _dirty, image) => { this.frame = image; this.frameSerial++ })
      this.webContents.on('console-message', (...args) => {
      const message = typeof args[1] === 'object' ? args[1] : { level: args[1], message: args[2] }
      if (message.level === 'error' || message.level === 3) errors.push(message.message)
    }) }
    showInactive() { trace.push('show-without-activation') }
  }
  const placementFile = path.join(scratch, 'placement.json')
  const service = createDesktopControlService({ BrowserWindow: HiddenControlWindow, screen, ipcMain, placementFile, intervalMs: 30,
    coreToken: () => null,
    rpcRequest: async (origin, method, params) => {
      calls.push({ origin, method, params })
      if (method === 'desktop.control') {
        if (failControl) throw new Error('临时测试连接失败')
        status.paused = params.action === 'pause'; status.stopped = params.action === 'stop'; status.busy = false; status.operations = []
        status.control = { action: params.action, source: 'manual', changedAt: Date.now(),
          message: params.action === 'pause' ? '用户在控制窗口暂停了桌面控制' : params.action === 'stop' ? '用户在控制窗口停止了桌面控制' : '用户在控制窗口恢复了桌面控制' }
      }
      return structuredClone(status)
    },
    createWindow: options => createDesktopControlWindow(options),
  })
  let other
  try {
    service.start()
    await until(() => calls.some(c => c.origin === 'local' && c.method === 'desktop.status'))
    await pause(100)
    assert.equal(windows.length, 0, 'Active desktop calls must not create a popup')
    assert.equal(trace.length, 0)
    service.show(); await until(() => windows.length === 1)
    const window = windows[0], js = code => window.webContents.executeJavaScript(code)
    const screenshot = async name => {
      await until(async () => await js("!document.getElementById('toggle').disabled || document.getElementById('title').textContent === '桌面控制已停止'"))
      await pause(100)
      await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      for (let frame = 0; frame < 2; frame++) {
        const before = window.frameSerial
        window.webContents.invalidate()
        await until(() => window.frameSerial > before && window.frame && !window.frame.isEmpty())
      }
      await pause(100)
      await writeFile(path.join(evidence, name), window.frame.toPNG())
    }
    await until(async () => await js("document.getElementById('title')?.textContent") === '智能体正在操作桌面')
    assert.equal(window.isVisible(), false, 'Acceptance never shows a foreground window')
    assert.equal(window.isAlwaysOnTop(), true)
    assert.equal(window.isResizable(), false)
    const isolation = window.webContents.getLastWebPreferences()
    assert.equal(isolation.sandbox, true); assert.equal(isolation.nodeIntegration, false); assert.equal(isolation.contextIsolation, true)
    assert.equal(await js("typeof window.edenAgentDesktop"), 'undefined')
    assert.equal(await js("getComputedStyle(document.querySelector('header')).webkitAppRegion"), 'drag')
    assert.equal(await js("getComputedStyle(document.getElementById('stop')).webkitAppRegion"), 'no-drag')
    assert.equal(await js("document.body.innerText.includes('private-fixture-id')"), false)
    await screenshot('running.png')
    const showCount = trace.length; await pause(100); assert.equal(trace.length, showCount, 'Polling must not repeatedly raise the window')
    const operations = structuredClone(status.operations)
    for (let step = 0; step < 3; step++) {
      status.busy = false; status.operations = []
      await until(async () => await js("document.getElementById('title').textContent") === '桌面控制就绪')
      await pause(65)
      status.busy = true; status.operations = structuredClone(operations)
      await until(async () => await js("document.getElementById('title').textContent") === '智能体正在操作桌面')
      assert.equal(trace.length, showCount, 'Idle gaps must not hide and reopen the native control window')
    }
    await js("document.getElementById('toggle').click()")
    await until(async () => await js("document.getElementById('title').textContent") === '桌面控制已暂停')
    await until(async () => (await js("document.getElementById('detail').textContent")).includes('控制窗口暂停'))
    await screenshot('paused.png')
    status.control = { action: 'pause', source: 'physical_input', changedAt: Date.now() + 1,
      message: '检测到本机输入，已暂停桌面控制' }
    await until(async () => (await js("document.getElementById('detail').textContent")).includes('检测到本机输入'))
    await screenshot('takeover-paused.png')
    await js("document.getElementById('pin').click()")
    await until(() => !window.isAlwaysOnTop())
    assert.equal(await js("document.getElementById('pin').getAttribute('aria-label')"), '置顶窗口')
    const before = window.getBounds(), area = screen.getDisplayMatching(before).workArea
    const x = Math.max(area.x, before.x - 60), y = before.y + 20
    window.setBounds({ ...before, x, y }); window.emit('moved')
    await until(async () => { const saved = JSON.parse(await readFile(placementFile, 'utf8')); return saved.x === x && saved.y === y && !saved.topmost })
    await js("document.getElementById('stop').click()")
    await until(async () => await js("document.getElementById('title').textContent") === '桌面控制已停止')
    await screenshot('stopped.png')
    failControl = true
    await js("document.getElementById('toggle').click()")
    await until(async () => (await js("document.getElementById('detail').textContent")).includes('临时测试连接失败'))
    assert.equal(calls.filter(c => c.method === 'desktop.control' && c.params.action === 'resume').length, 1)
    failControl = false
    await js("document.getElementById('toggle').click()")
    await until(() => status.stopped === false)
    service.show()
    await until(async () => await js("document.getElementById('title').textContent") === '桌面控制就绪')
    const nativeControlsBefore = calls.filter(c => c.method === 'desktop.control').length
    other = new BrowserWindow({ show: false, webPreferences: { preload: path.resolve(__dirname, '../../src/desktop-control/control-preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false } })
    await other.loadURL('data:text/html,<meta charset="utf-8"><title>Isolated sender fixture</title>')
    const rejected = await other.webContents.executeJavaScript("window.edenDesktopControl.command('stop').then(()=>false,e=>e.message)")
    assert.match(rejected, /来源不匹配/)
    assert.equal(calls.filter(c => c.method === 'desktop.control').length, nativeControlsBefore)
    await js("document.getElementById('close').click()")
    assert.equal(windows.length, 1)
    const hiddenShowCount = trace.length
    for (let step = 0; step < 3; step++) {
      status.busy = true; status.operations = structuredClone(operations)
      await until(async () => await js("document.getElementById('title').textContent") === '智能体正在操作桌面')
      await pause(65)
      status.busy = false; status.operations = []
      await until(async () => await js("document.getElementById('title').textContent") === '桌面控制就绪')
      assert.equal(trace.length, hiddenShowCount, 'Calls after closing must not reopen the control window')
    }
    service.show(); await pause(50); assert.equal(windows.length, 1)
    assert.equal(trace.length, hiddenShowCount + 1, 'Only explicit tray opening shows the same window again')
    assert.deepEqual(errors, [])
    const report = { passed: true, hiddenNativeWindows: true, nativeInputPerformed: false, ipcSenderGuard: true, idleGapsDoNotReopen: true,
      manualOpenOnly: true, closedCallsDoNotReopen: true,
      rememberedPosition: JSON.parse(await readFile(placementFile, 'utf8')), controls: calls.filter(c => c.method === 'desktop.control'), trace, errors }
    await writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2))
    process.stdout.write(`EDEN_CONTROL_RESULT=${JSON.stringify(report)}\n`)
  } finally { service.close(); if (other && !other.isDestroyed()) other.destroy() }
}
app.whenReady().then(run).then(() => app.exit(0), error => { console.error(error); app.exit(1) })
