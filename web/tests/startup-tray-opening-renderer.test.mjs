import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { _electron } from 'playwright-core'

test('native tray reopening replays the opening over retained room and login state', {
  timeout: 180000, skip: process.platform !== 'win32',
}, async t => {
  const web = fileURLToPath(new URL('../', import.meta.url)), agent = path.resolve(web, '../..')
  const assets = path.join(web, 'public/startup-scene')
  try { await access(path.join(assets, 'manifest.json')) } catch { t.skip('Local startup assets are required'); return }
  const scratch = await mkdtemp(path.join(tmpdir(), 'eden-tray-opening-'))
  const evidence = path.join(agent, '../.release/current/Agent/startup-tray-opening')
  await mkdir(evidence, { recursive: true })
  const css = await readFile(path.join(web, 'dist/assets', (await readdir(path.join(web, 'dist/assets'))).find(name => name.endsWith('.css'))))
  const checks = [], errors = [], requests = [], images = []
  let application, page, loginCalls = 0
  const http = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://fixture').pathname
      if (pathname === '/fixture/login') { loginCalls++; response.writeHead(401).end('{}'); return }
      if (pathname.startsWith('/startup-scene/')) {
        requests.push(pathname)
        const name = pathname.slice('/startup-scene/'.length)
        if (name.includes('/') || name.includes('..')) { response.writeHead(404).end(); return }
        response.setHeader('content-type', name.endsWith('.png') ? 'image/png' : 'application/octet-stream')
        response.end(await readFile(path.join(assets, name))); return
      }
      if (pathname === '/style.css') { response.setHeader('content-type', 'text/css'); response.end(css); return }
      if (/\.(js|png|jpg|svg)$/.test(pathname)) {
        const filename = path.resolve(scratch, '.' + pathname)
        if (path.dirname(filename) !== scratch) { response.writeHead(404).end(); return }
        response.setHeader('content-type', pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.svg') ? 'image/svg+xml' : 'image/png')
        response.end(await readFile(filename)); return
      }
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end('<!doctype html><html lang="zh-CN" data-base-theme="cream"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="margin:0"><div id="root"></div><script src="/renderer.js"></script></body></html>')
    } catch { if (!response.destroyed) response.writeHead(404).end() }
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  try {
    const origin = `http://127.0.0.1:${http.address().port}/`
    await build({ absWorkingDir: web, entryPoints: ['tests/fixtures/startup-entrance-renderer.tsx'], outfile: path.join(scratch, 'renderer.js'),
      bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', loader: { '.png': 'file', '.jpg': 'file', '.svg': 'file' },
      logLevel: 'silent', define: { __MON_AUTH_MODE__: '"production"', 'import.meta.env': JSON.stringify({ DEV: true,
        VITE_EDEN_AGENT_MON_BASE_URL: origin, VITE_EDEN_AGENT_LOCAL_BASE_URL: origin }) } })
    const main = path.join(scratch, 'main.cjs')
    const preload = path.join(agent, 'frontend/desktop/src/preload.cjs')
    const visibility = path.join(agent, 'frontend/desktop/src/windows/main-window-visibility.cjs')
    const tray = path.join(agent, 'frontend/desktop/src/windows/tray-controller.cjs')
    await writeFile(main, `const{app,BrowserWindow,ipcMain}=require('electron');
const{EventEmitter}=require('node:events');
const{attachMainWindowVisibility}=require(${JSON.stringify(visibility)});
const{createTrayController}=require(${JSON.stringify(tray)});
app.disableHardwareAcceleration();app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.setPath('userData',${JSON.stringify(path.join(scratch, 'profile'))});app.on('window-all-closed',()=>{});
app.whenReady().then(()=>{
 const win=globalThis.primary=new BrowserWindow({show:false,opacity:0,focusable:false,skipTaskbar:true,useContentSize:true,width:960,height:540,
 webPreferences:{preload:${JSON.stringify(preload)},sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
 win.webContents.setFrameRate(30);attachMainWindowVisibility(win,{ipcMain});
 class TestTray extends EventEmitter{setToolTip(){}setContextMenu(menu){this.menu=menu}}
 const icon={isEmpty:()=>false};
 globalThis.tray=createTrayController({Menu:{buildFromTemplate:menu=>menu},Tray:TestTray,nativeImage:{createFromPath:()=>icon},
 title:'isolated tray fixture',resolveDesktopIconPath:()=>'fixture-icon',getMainWindow:()=>win,getPetWindow:()=>null,
 hidePetWindows(){},createPetWindow(){},createSettingsWindow(){},onQuit(){}});
 globalThis.trayIcon=globalThis.tray.createTray();win.loadURL('about:blank');
});`)
    // The tray icon is a test adapter; native BrowserWindow show/hide, production preload and IPC are real.
    // Opacity zero, non-focusable and skipTaskbar prevent this isolated test from disturbing the user's desktop.
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    application = await _electron.launch({ executablePath: path.join(agent, 'node_modules/electron/dist/electron.exe'), args: [main], env })
    page = await application.firstWindow(); page.setDefaultTimeout(20000)
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error' && /shader|WebGL|Pixi|INVALID_/i.test(message.text())) errors.push(message.text()) })
    const cdp = await page.context().newCDPSession(page)
    const capture = async name => {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile(path.join(evidence, name + '.png'), Buffer.from(shot.data, 'base64')); images.push(name)
    }
    const active = value => page.waitForFunction(value => document.querySelector('[data-startup-opening-overlay]')?.getAttribute('data-opening-active') === String(value), value)
    const show = async (menu = false) => {
      await application.evaluate((_electron, menu) => menu ? globalThis.trayIcon.menu[0].click() : globalThis.trayIcon.emit('click'), menu)
      await active(true)
    }
    const hide = async () => { await application.evaluate(() => globalThis.primary.hide()); await active(false) }
    const overlay = page.locator('[data-startup-opening-overlay]')
    const actor = page.getByRole('button', { name: '呼唤阿罗娜，打开登录', exact: true })
    const skip = () => page.getByRole('button', { name: '跳过开场动画' }).click()
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto(origin)
    await active(false)
    const initial = await page.locator('.startup-opening-emblem').evaluate(element => getComputedStyle(element).transform)
    await page.waitForTimeout(3400)
    assert.equal(await page.locator('.startup-opening-emblem').evaluate(element => getComputedStyle(element).transform), initial)
    assert.equal(await overlay.getAttribute('data-opening-phase'), 'playing')
    await show(); await page.waitForTimeout(1450); await capture('initial-tray-opening')
    assert.equal(await overlay.count(), 1); await actor.waitFor()
    await application.evaluate(() => globalThis.primary.webContents.setBackgroundThrottling(true))
    checks.push('hidden-startup-pauses-until-real-tray-show-and-then-plays-the-opening')

    await page.getByRole('combobox', { name: '运行模式' }).selectOption('local')
    await page.getByRole('button', { name: '切换角色动作', exact: true }).click()
    const pose = await page.locator('[data-startup-phase]').getAttribute('data-startup-pose'), loaded = requests.length
    await page.evaluate(() => { window.keptCanvas = document.querySelector('canvas') })
    await hide(); await show(true)
    assert.equal(await actor.count(), 0)
    await skip(); await actor.waitFor()
    assert.equal(await page.locator('[data-startup-phase]').getAttribute('data-startup-pose'), pose)
    assert.equal(await page.getByRole('combobox', { name: '运行模式' }).inputValue(), 'local')
    assert.equal(await page.evaluate(() => window.keptCanvas === document.querySelector('canvas')), true)
    assert.equal(requests.length, loaded)
    checks.push('tray-menu-replays-room-opening-without-reloading-canvas-assets-pose-or-world')

    await application.evaluate(() => { globalThis.trayIcon.emit('click'); globalThis.primary.emit('focus') })
    await page.waitForTimeout(200); assert.equal(await overlay.count(), 0)
    checks.push('already-visible-tray-click-and-focus-do-not-replay')
    await page.getByRole('combobox', { name: '运行模式' }).selectOption('mon')
    await actor.click(); await page.getByRole('dialog').waitFor()
    await page.getByLabel('用户名', { exact: true }).fill('temporary-tray-account')
    await page.getByLabel('密码', { exact: true }).fill('temporary-not-real')
    await hide(); await page.waitForTimeout(3400)
    assert.equal(await overlay.getAttribute('data-opening-phase'), 'playing')
    await show(); await page.keyboard.press('Escape')
    assert.equal(await page.locator('[data-startup-phase]').getAttribute('data-startup-phase'), 'login')
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.waitForTimeout(1450); await capture('login-tray-opening')
    await page.getByRole('dialog').waitFor()
    assert.equal(await page.getByLabel('用户名', { exact: true }).inputValue(), 'temporary-tray-account')
    assert.equal(await page.getByLabel('密码', { exact: true }).inputValue(), 'temporary-not-real')
    assert.equal(loginCalls, 0)
    await capture('login-preserved-after-opening')
    checks.push('login-replays-after-long-hidden-time-and-retains-form-without-submitting-or-escaping')

    await hide(); await show(true); await page.waitForTimeout(400)
    await hide(); await show(); await page.waitForTimeout(2100)
    assert.equal(await overlay.getAttribute('data-opening-phase'), 'playing')
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.getByRole('dialog').waitFor()
    checks.push('rapid-hide-and-show-restarts-full-playback-without-stale-completion')

    await application.evaluate(() => globalThis.primary.minimize()); await active(false)
    assert.equal(await application.evaluate(() => globalThis.primary.isMinimized()), true)
    await show(true); assert.equal(await application.evaluate(() => globalThis.primary.isMinimized()), false)
    await skip(); await page.getByRole('dialog').waitFor()
    assert.equal(await page.getByLabel('用户名', { exact: true }).inputValue(), 'temporary-tray-account')
    checks.push('minimized-window-restores-from-tray-and-replays-over-the-same-login')

    await page.getByRole('button', { name: '返回教室' }).click(); await actor.waitFor()
    await page.getByRole('combobox', { name: '运行模式' }).selectOption('local')
    await actor.click(); await page.getByRole('button', { name: '进入尘世', exact: true }).click()
    await page.locator('[data-startup-complete]').waitFor()
    await application.evaluate(() => { globalThis.primary.hide(); globalThis.trayIcon.emit('click') })
    await page.waitForTimeout(250)
    assert.equal(await overlay.count(), 0); assert.equal(await page.locator('[data-startup-complete]').count(), 1)
    checks.push('completed-entry-disposes-replay-listener-and-main-surface-is-not-covered')

    await page.goto(origin + '?plainLogin')
    await page.getByLabel('用户名', { exact: true }).fill('temporary-expired-session')
    await page.getByLabel('密码', { exact: true }).fill('temporary-not-real')
    assert.equal(await overlay.count(), 0)
    await hide(); await show(true)
    assert.equal(await page.getByRole('textbox', { name: '用户名', exact: true }).count(), 0)
    await page.keyboard.type('must-not-reach-the-form')
    assert.equal(await page.locator('input[name="password"]').inputValue(), 'temporary-not-real')
    await page.waitForTimeout(1450); await capture('standalone-login-tray-opening')
    await skip(); await page.getByRole('textbox', { name: '用户名', exact: true }).waitFor()
    assert.equal(await page.getByLabel('用户名', { exact: true }).inputValue(), 'temporary-expired-session')
    assert.equal(await page.getByLabel('密码', { exact: true }).inputValue(), 'temporary-not-real')
    checks.push('standalone-login-after-expired-auth-replays-from-tray-and-preserves-input')

    await page.goto(origin + '?missing'); await page.getByRole('dialog').waitFor()
    await hide(); await show(); await skip(); await page.getByRole('dialog').waitFor()
    assert.equal(await page.locator('[data-startup-phase]').getAttribute('data-startup-phase'), 'login')
    checks.push('missing-scene-login-fallback-can-also-replay-and-recover')
    await page.emulateMedia({ reducedMotion: 'reduce' }); await hide()
    assert.equal(await overlay.getAttribute('data-reduced-motion'), 'true')
    await application.evaluate(() => globalThis.trayIcon.emit('click'))
    await page.getByRole('dialog').waitFor(); assert.equal(await overlay.count(), 0)
    checks.push('reduced-motion-reopen-uses-static-cover-and-immediate-ready-content')
    assert.deepEqual(errors, [])
    const result = { passed: true, verifiedAt: new Date().toISOString(), checks, errors, images, loginCalls,
      realNativeVisibility: true, realProductionPreload: true, realProductionTrayHandlers: true, nativeBackgroundThrottling: true,
      osTrayIcon: 'test adapter', realPrivateAssets: true }
    await writeFile(path.join(evidence, 'tray-opening-result.json'), JSON.stringify(result, null, 2)); t.diagnostic(JSON.stringify(result))
    await cdp.detach()
  } catch (error) {
    await writeFile(path.join(evidence, 'failure-' + Date.now() + '.json'), JSON.stringify({ error: String(error), errors,
      surface: await page?.evaluate(() => document.body.innerText).catch(() => null) }, null, 2)); throw error
  } finally {
    await application?.close(); http.closeAllConnections(); await new Promise(resolve => http.close(resolve))
    assert.equal(path.dirname(path.resolve(scratch)), path.resolve(tmpdir()))
    assert.ok(path.basename(scratch).startsWith('eden-tray-opening-'))
    await rm(scratch, { recursive: true, force: true })
  }
})
