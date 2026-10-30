const assert = require('node:assert/strict')
const { app, BrowserWindow, ipcMain, screen } = require('electron')
const { writeFile, mkdir } = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createQuestionWindowController } = require('../../src/windows/question-window.cjs')
const { attachPrimaryRendererStartup } = require('../../src/windows/primary-renderer-startup.cjs')
const [scratch, evidence] = process.argv.slice(2)
app.disableHardwareAcceleration()
app.setPath('userData', path.join(scratch, 'profile'))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check) {
  for (let i = 0; i < 160; i++) { if (await check()) return; await delay(25) }
  throw new Error('Question fixture timed out')
}
async function run() {
  const windows = [], replies = [], showCalls = [], crashes = []
  let failReply = false, refreshes = 0
  class HiddenWindow extends BrowserWindow {
    constructor(options) { super({ ...options, show: false, webPreferences: { ...options.webPreferences, offscreen: true } }); windows.push(this) }
    show() { this.requestedVisible = true; showCalls.push(this.id) }
    hide() { this.requestedVisible = false; super.hide() }
    focus() { /* Foreground tests are deferred; all actual native windows stay hidden. */ }
  }
  const preload = path.join(scratch, 'preload.cjs')
  const main = new HiddenWindow({ width: 1000, height: 800, webPreferences: { preload, sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  let startupReady = false
  attachPrimaryRendererStartup(main, { ipcMain, onReady: () => { startupReady = true } })
  const url = role => { const url = pathToFileURL(path.join(scratch, 'index.html')); url.searchParams.set('role', role); return url.href }
  let decision
  const controller = createQuestionWindowController({ BrowserWindow: HiddenWindow, screen, preload,
    resolveIcon: () => undefined, load: window => { decision = window; void window.loadURL(url('question')) },
    attach: window => window.webContents.on('render-process-gone', () => crashes.push({ destroyed: window.isDestroyed() })),
    quitting: () => false, owner: () => main.webContents })
  ipcMain.handle('eden-agent:invoke', (event, command, args) => {
    if (command !== 'set_question_window_visible') throw new Error('Unexpected window command')
    return controller.setVisible(event.sender, Boolean(args.visible))
  })
  ipcMain.handle('question-fixture', (_event, command, args) => {
    if (command === 'refresh') { refreshes++; return true }
    if (command !== 'reply' && command !== 'reject') throw new Error('Unexpected question action')
    if (failReply) throw new Error('fixture answer failed')
    replies.push({ command, ...args })
    for (const window of windows) if (!window.isDestroyed()) window.webContents.send('fixture-answered', args.requestID)
    return true
  })
  const js = (window, code) => window.webContents.executeJavaScript(code)
  const click = (window, text) => js(window, `[...document.querySelectorAll('button')].find(node=>node.textContent===${JSON.stringify(text)}).click()`)
  const ready = window => until(() => js(window, 'Boolean(window.fixtureReady)'))
  const has = (window, text) => js(window, `document.body.textContent.includes(${JSON.stringify(text)})`)
  const capture = async (window, name) => { await delay(150); await writeFile(path.join(evidence, name), (await window.webContents.capturePage()).toPNG()) }
  try {
    await mkdir(evidence, { recursive: true })
    await main.loadURL(url('main')); await ready(main); await until(() => startupReady)
    assert.equal(main.webContents.getBackgroundThrottling(), false, 'startup must not re-enable hidden-renderer throttling')
    controller.create(); await ready(decision)
    await js(main, 'window.deliverQuestion()')
    await until(() => Boolean(decision.requestedVisible))
    assert.equal(await has(decision, '暂无待答问题'), true, 'main opens the window before the auxiliary renderer receives its question')
    await assert.rejects(js(decision, "window.edenAgentDesktop.invoke('set_question_window_visible',{visible:false})"), /只有主窗口/)
    assert.equal(decision.requestedVisible, true)
    await capture(decision, 'empty-state.png')
    await js(decision, 'window.failQuestionSync()')
    await until(() => has(decision, '同步失败'))
    await click(decision, '重新同步')
    await until(() => has(decision, '确认选择'))
    assert.equal(refreshes, 1)
    await js(decision, "document.querySelector('input[type=checkbox]').click()")
    failReply = true
    await click(decision, '确认选择'); await until(() => has(decision, '问题答复失败'))
    assert.equal(replies.length, 0)
    failReply = false
    await capture(decision, 'decision-retry.png')
    await click(decision, '确认选择')
    await until(async () => replies.length === 1 && !await has(main, '在此回答'))
    assert.deepEqual(replies[0].answers, [['继续']])
    await js(main, "window.deliverQuestion('fallback-decision')")
    await until(() => Boolean(decision.requestedVisible))
    decision.close()
    await until(() => !decision.requestedVisible)
    assert.equal(await has(main, '在此回答'), true)
    await click(main, '在此回答'); await until(() => has(main, '确认选择'))
    await js(main, "document.querySelector('input[type=checkbox]').click()")
    await capture(main, 'main-fallback.png')
    await click(main, '确认选择')
    await until(() => replies.length === 2)
    assert.equal(replies[1].requestID, 'fallback-decision')
    assert.deepEqual(replies[1].answers, [['继续']])
    assert.ok(showCalls.length >= 2, 'a different request with the same count still wakes the native window')
    await js(main, "window.deliverQuestion('crash-decision')")
    await until(() => Boolean(decision.requestedVisible))
    const crashed = decision
    assert.notEqual(main.webContents.getOSProcessId(), decision.webContents.getOSProcessId())
    crashed.webContents.forcefullyCrashRenderer()
    await until(() => crashed.isDestroyed())
    assert.deepEqual(crashes, [{ destroyed: false }], 'diagnostics must run before destroying the crashed window')
    assert.equal(await has(main, '在此回答'), true, 'the primary answer remains usable after a native renderer crash')
    await click(main, '打开问题窗口')
    await until(() => decision !== crashed); await ready(decision)
    assert.equal(Boolean(decision.requestedVisible), true)
    assert.ok(windows.every(window => window.isDestroyed() || !window.isVisible()), 'no actual native window was shown')
    const report = { passed: true, primaryOwnsVisibility: true, emptyAuxiliaryCannotHide: true, explicitLoadingAndRetry: true,
      answerFailureRecoverable: true, fallbackAnswerAfterNativeHide: true, hiddenNativeWindows: true,
      primaryRemainsActiveAfterStartup: true, crashedRendererRecreated: true, nativeInputPerformed: false,
      replies: replies.map(value => ({ command: value.command, answers: value.answers })) }
    await writeFile(path.join(evidence, 'renderer.json'), JSON.stringify(report, null, 2))
    process.stdout.write('QUESTION_WINDOW_RESULT=' + JSON.stringify(report) + '\n')
  } finally { for (const window of windows) if (!window.isDestroyed()) window.destroy() }
}
app.whenReady().then(run).then(() => app.quit(), error => { process.stderr.write(String(error.stack || error)); app.exit(1) })
