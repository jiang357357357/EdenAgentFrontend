import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { _electron } from 'playwright-core'

test('cold and cached lighting switches retain the native canvas throughout loading and prewarming', { timeout: 180000, skip: process.platform !== 'win32' }, async t => {
  const web = fileURLToPath(new URL('../', import.meta.url)), agent = path.resolve(web, '../..')
  const assets = path.join(web, 'public/startup-scene')
  try { await access(path.join(assets, 'manifest.json')) } catch { t.skip('Local startup assets are required'); return }
  const scratch = await mkdtemp(path.join(tmpdir(), 'eden-startup-handoff-'))
  const evidence = path.join(agent, '.artifacts/startup-handoff-20261021')
  await mkdir(evidence, { recursive: true })
  const css = await readFile(path.join(web, 'dist/assets', (await readdir(path.join(web, 'dist/assets'))).find(name => name.endsWith('.css'))))
  const requests = [], heldRequests = [], errors = [], checks = [], screenshots = []
  let releaseNight, observeNight, application, page
  const nightGate = new Promise(resolve => { releaseNight = resolve })
  const nightRequested = new Promise(resolve => { observeNight = resolve })
  let delayNight = true
  const http = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://fixture').pathname
      if (pathname.startsWith('/startup-scene/')) {
        const name = pathname.slice('/startup-scene/'.length)
        if (name.includes('/') || name.includes('..')) { response.writeHead(404).end(); return }
        requests.push(name)
        if (delayNight && /nighttime|NP0035/.test(name)) { heldRequests.push(name); observeNight(); await nightGate }
        if (response.destroyed) return
        response.setHeader('content-type', name.endsWith('.png') ? 'image/png' : 'application/octet-stream')
        response.end(await readFile(path.join(assets, name))); return
      }
      if (pathname === '/renderer.js') { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(path.join(scratch, 'renderer.js'))); return }
      if (pathname === '/style.css') { response.setHeader('content-type', 'text/css'); response.end(css); return }
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end('<!doctype html><html data-base-theme="cream"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="margin:0"><div id="root"></div><script src="/renderer.js"></script></body></html>')
    } catch { if (!response.destroyed) response.writeHead(404).end() }
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  try {
    await build({ absWorkingDir: web, entryPoints: ['tests/fixtures/startup-handoff-renderer.tsx'], outfile: path.join(scratch, 'renderer.js'),
      bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent', define: { 'import.meta.env': '{"DEV":true}' } })
    const main = path.join(scratch, 'main.cjs')
    await writeFile(main, `const{app,BrowserWindow}=require('electron');app.disableHardwareAcceleration();app.commandLine.appendSwitch('enable-unsafe-swiftshader');app.setPath('userData',${JSON.stringify(path.join(scratch, 'profile'))});app.on('window-all-closed',()=>{});app.whenReady().then(()=>{const win=new BrowserWindow({show:false,useContentSize:true,width:960,height:540,webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true}});win.webContents.setFrameRate(30);win.loadURL('about:blank')});`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    application = await _electron.launch({ executablePath: path.join(agent, 'node_modules/electron/dist/electron.exe'), args: [main], env })
    page = await application.firstWindow(); page.setDefaultTimeout(30000)
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error' && /shader|WebGL|Pixi|INVALID_/i.test(message.text())) errors.push(message.text()) })
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 2, mobile: false })
    await page.goto(`http://127.0.0.1:${http.address().port}/`)
    const actor = name => page.getByRole('button', { name: `呼唤${name}，打开登录` })
    const sun = page.getByRole('button', { name: '切换为白天', exact: true }), moon = page.getByRole('button', { name: '切换为夜晚', exact: true })
    const action = page.getByRole('button', { name: '切换角色动作', exact: true })
    const capture = async name => {
      const shot = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true })
      const bytes = Buffer.from(shot.data, 'base64')
      await writeFile(path.join(evidence, name + '.png'), bytes)
      screenshots.push({ name, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) })
    }
    await actor('阿罗娜').waitFor()
    await page.evaluate(() => {
      window.handoff = { canvas: document.querySelector('canvas'), renderer: document.querySelector('[data-startup-renderer]'), samples: [], running: true }
      const sample = () => {
        const test = window.handoff, canvas = document.querySelector('canvas'), renderer = document.querySelector('[data-startup-renderer]')
        test.samples.push({ at: performance.now(), sameCanvas: canvas === test.canvas, sameRenderer: renderer === test.renderer,
          canvasCount: document.querySelectorAll('canvas').length, posterCount: document.querySelectorAll('[data-startup-room] img').length,
          opacity: renderer && getComputedStyle(renderer).opacity, loading: renderer?.dataset.sceneLoading, source: renderer?.dataset.sceneSource,
          width: canvas?.width, height: canvas?.height, expectedWidth: innerWidth * devicePixelRatio, expectedHeight: innerHeight * devicePixelRatio,
          roomFilterResolution: window.handoffRoomResolution, dpr: devicePixelRatio })
        if (test.running) requestAnimationFrame(sample)
      }
      sample()
    })
    await capture('before-cold-switch')
    await moon.click(); await nightRequested
    await page.waitForFunction(() => document.querySelector('[data-startup-renderer]').dataset.sceneLoading === 'true')
    assert.ok(heldRequests.length > 0)
    assert.equal(await actor('普拉娜').count(), 0)
    assert.equal(await action.isDisabled(), true)
    await capture('cold-load-held-start'); await page.waitForTimeout(900); await capture('cold-load-held-end')
    const held = await page.evaluate(() => window.handoff.samples.filter(sample => sample.loading === 'true'))
    assert.ok(held.length >= 3)
    assert.ok(held.every(sample => sample.source === 'day' && sample.posterCount === 0 && sample.opacity === '1' && sample.sameCanvas))
    checks.push('delayed-cold-load-keeps-old-native-scene-visible-without-posters')
    delayNight = false; releaseNight()
    await actor('普拉娜').waitFor(); await capture('cold-switch-complete')
    checks.push('new-scene-becomes-interactive-only-after-full-resolution-prewarming-and-commit')
    const afterCold = requests.length
    await sun.click(); await actor('阿罗娜').waitFor(); await capture('cached-day')
    await moon.click(); await actor('普拉娜').waitFor(); await capture('cached-night')
    assert.equal(requests.length, afterCold)
    checks.push('both-lighting-models-and-textures-reused-without-new-asset-requests')
    for (let index = 0; index < 5; index++) await action.click()
    assert.equal(requests.length, afterCold)
    checks.push('pose-switches-keep-canvas-and-native-resolution')
    await sun.click(); await moon.click(); await sun.click(); await moon.click(); await actor('普拉娜').waitFor()
    assert.equal(requests.length, afterCold)
    checks.push('rapid-switch-cancels-pending-scenes-without-exposing-placeholder')
    await session.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false })
    await page.waitForFunction(() => document.querySelector('canvas').width === 3840)
    await sun.click(); await actor('阿罗娜').waitFor(); await capture('cached-switch-4k')
    assert.deepEqual(screenshots.at(-1), { name: 'cached-switch-4k', width: 3840, height: 2160 })
    assert.equal(await page.evaluate(() => window.handoffRoomResolution), 2)
    checks.push('cached-switch-preserves-native-4k-canvas-and-2x-room-filter')
    const samples = await page.evaluate(() => { window.handoff.running = false; return window.handoff.samples })
    const invalid = samples.filter(sample => !sample.sameCanvas || !sample.sameRenderer || sample.canvasCount !== 1 || sample.posterCount !== 0 || sample.opacity !== '1')
    assert.deepEqual(invalid, [])
    assert.ok(samples.every(sample => sample.width >= 1920 && sample.height >= 1080))
    checks.push('every-observed-frame-retains-one-visible-original-canvas-with-no-low-resolution-poster')
    assert.deepEqual(errors, [])
    await writeFile(path.join(evidence, 'continuity-frames.json'), JSON.stringify(samples, null, 2))
    const result = { passed: true, verifiedAt: new Date().toISOString(), checks, errors, frameCount: samples.length,
      heldRequests, assetRequests: requests, screenshots, realPrivateAssets: true, authenticationRequests: 0 }
    await writeFile(path.join(evidence, 'handoff-result.json'), JSON.stringify(result, null, 2)); t.diagnostic(JSON.stringify(result))
    await session.detach()
  } catch (error) {
    await writeFile(path.join(evidence, 'failure-' + Date.now() + '.json'), JSON.stringify({ error: String(error), errors, requests,
      surface: await page?.evaluate(() => document.querySelector('[data-startup-phase]')?.outerHTML).catch(() => null) }, null, 2))
    throw error
  } finally {
    releaseNight(); await application?.close(); http.closeAllConnections(); await new Promise(resolve => http.close(resolve))
    assert.equal(path.dirname(path.resolve(scratch)), path.resolve(tmpdir()))
    assert.ok(path.basename(scratch).startsWith('eden-startup-handoff-'))
    await rm(scratch, { recursive: true, force: true })
  }
})
