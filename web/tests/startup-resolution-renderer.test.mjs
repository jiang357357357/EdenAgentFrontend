import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { _electron } from 'playwright-core'

test('actual HiDPI canvas and foreground filters stay native across resizing and DPR changes', { timeout: 240000, skip: process.platform !== 'win32' }, async t => {
  const web = fileURLToPath(new URL('../', import.meta.url)), agent = path.resolve(web, '../..')
  const assets = path.join(web, 'public/startup-scene'), startup = path.join(web, 'src/pages/startup')
  try { await access(path.join(assets, 'manifest.json')) } catch { t.skip('Local startup assets are required'); return }
  const evidence = path.join(agent, '../.release/current/Agent/startup-sharpness')
  await mkdir(evidence, { recursive: true })
  const scratch = await mkdtemp(path.join(tmpdir(), 'eden-startup-hidpi-'))
  const cssName = (await readdir(path.join(web, 'dist/assets'))).find(name => name.endsWith('.css'))
  const css = await readFile(path.join(web, 'dist/assets', cssName))
  const snapshots = [], checks = [], observations = [], errors = [], runtimeLogs = []
  let application, page
  const http = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://fixture'), name = path.basename(url.pathname)
      if (url.pathname.startsWith('/startup-scene/')) {
        if (url.pathname !== '/startup-scene/' + name) throw new Error('Invalid asset name')
        response.setHeader('content-type', name.endsWith('.png') ? 'image/png' : 'application/octet-stream')
        response.end(await readFile(path.join(assets, name))); return
      }
      if (url.pathname === '/style.css') { response.setHeader('content-type', 'text/css'); response.end(css); return }
      if (name === 'before.js' || name === 'after.js') {
        response.setHeader('content-type', 'text/javascript'); response.end(await readFile(path.join(scratch, name))); return
      }
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end(`<!doctype html><html lang="zh-CN" data-base-theme="cream"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="margin:0"><div id="root"></div><script src="/${url.searchParams.has('before') ? 'before' : 'after'}.js"></script></body></html>`)
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${http.address().port}`
  try {
    const options = { absWorkingDir: web, entryPoints: ['tests/fixtures/startup-resolution-renderer.tsx'], bundle: true,
      platform: 'browser', format: 'iife', jsx: 'automatic', logLevel: 'silent', define: { 'import.meta.env': '{"DEV":true}' } }
    await build({ ...options, outfile: path.join(scratch, 'after.js') })
    let hasBefore = false
    try { await access(path.join(evidence, 'before-source/scene-renderer.ts')); hasBefore = true } catch {}
    if (hasBefore) await build({ ...options, outfile: path.join(scratch, 'before.js'), plugins: [{ name: 'saved-before-renderer', setup(builder) {
      builder.onLoad({ filter: /[\\/]pages[\\/]startup[\\/]scene-(?:renderer|effects)\.ts$/ }, async args => ({
        contents: await readFile(path.join(evidence, 'before-source', path.basename(args.path)), 'utf8'), loader: 'ts', resolveDir: startup,
      }))
    } }] })
    const main = path.join(scratch, 'main.cjs')
    await writeFile(main, `const{app,BrowserWindow}=require('electron');app.disableHardwareAcceleration();app.commandLine.appendSwitch('enable-unsafe-swiftshader');app.setPath('userData',${JSON.stringify(path.join(scratch, 'profile'))});app.on('window-all-closed',()=>{});app.whenReady().then(()=>{const win=new BrowserWindow({show:false,useContentSize:true,width:960,height:540,webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true}});win.webContents.setFrameRate(15);win.loadURL('about:blank')});`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    application = await _electron.launch({ executablePath: path.join(agent, 'node_modules/electron/dist/electron.exe'), args: [main], env })
    page = await application.firstWindow(); page.setDefaultTimeout(30000)
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (['warning', 'error'].includes(message.type())) runtimeLogs.push(message.text())
      if (message.type() === 'error' && /shader|WebGL|Pixi|INVALID_/i.test(message.text())) errors.push(message.text())
    })
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 2, mobile: false })
    const inspect = () => page.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth, height: innerHeight,
      canvas: { width: document.querySelector('canvas').width, height: document.querySelector('canvas').height },
      filters: window.startupFilterSamples, resolution: JSON.parse(document.querySelector('[data-startup-renderer]').dataset.sceneResolution || 'null') }))
    const capture = async name => {
      await page.evaluate(() => { for (const animation of document.getAnimations()) if (Number.isFinite(Number(animation.effect?.getTiming().iterations))) animation.finish() })
      const shot = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true })
      const bytes = Buffer.from(shot.data, 'base64')
      await writeFile(path.join(evidence, name + '.png'), bytes)
      const size = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
      snapshots.push({ name, ...size }); return size
    }
    const enter = async () => {
      await page.getByRole('button', { name: /呼唤.*打开登录/ }).click()
      await page.getByRole('dialog').waitFor()
      await page.waitForFunction(() => !!window.startupFilterSamples.foreground)
    }
    const assertNative = value => {
      assert.ok(Math.abs(value.canvas.width - value.width * value.dpr) <= 1)
      assert.ok(Math.abs(value.canvas.height - value.height * value.dpr) <= 1)
      assert.equal(value.filters.foreground.resolution, value.dpr)
      assert.equal(value.filters.foreground.activeResolution, value.dpr)
      assert.ok(value.filters.foreground.width >= Math.floor(value.width * value.dpr))
      assert.ok(value.filters.foreground.height >= Math.floor(value.height * value.dpr))
    }
    if (hasBefore) {
      await page.goto(origin + '/?before=1'); await page.getByRole('button', { name: /呼唤.*打开登录/ }).waitFor()
      await enter(); const before = await inspect()
      observations.push({ name: 'before-hidpi', ...before })
      assert.equal(before.dpr, 2); assert.equal(before.canvas.width, before.width * 1.5)
      assert.equal(before.filters.foreground.resolution, 1)
      await capture('before-login-hidpi')
      checks.push('saved-original-reproduces-1.5x-canvas-and-1x-foreground-filter')
    }
    await page.goto(origin); await page.getByRole('button', { name: /呼唤.*打开登录/ }).waitFor()
    const idle = await inspect()
    assert.equal(idle.filters.room.resolution, 2); assert.equal(idle.canvas.width, 1920)
    observations.push({ name: 'after-idle-hidpi', ...idle }); await capture('after-room-hidpi')
    await enter(); const after = await inspect(); assertNative(after)
    assert.equal(after.filters.room.resolution, .5)
    observations.push({ name: 'after-login-hidpi', ...after }); await capture('after-login-hidpi')
    checks.push('2x-foreground-filter-uses-real-native-framebuffer-and-background-stays-downsampled')
    await session.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false })
    await page.waitForFunction(() => innerWidth === 1920 && document.querySelector('canvas').width === 3840 && window.startupFilterSamples.foreground.width >= 3840)
    const large = await inspect(); assertNative(large)
    observations.push({ name: 'after-login-4k', ...large })
    const image = await capture('after-login-4k'); assert.deepEqual(image, { width: 3840, height: 2160 })
    checks.push('1920x1080-logical-view-renders-and-captures-3840x2160-real-pixels')
    await session.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 2, mobile: false })
    await page.waitForFunction(() => innerWidth === 960 && innerHeight === 540)
    await page.getByLabel('用户名', { exact: true }).fill('quality-fixture')
    for (const ratio of [1.25, 3]) {
      await session.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: ratio, mobile: false })
      await page.waitForFunction(ratio => devicePixelRatio === ratio && document.querySelector('canvas').width === Math.round(960 * ratio)
        && window.startupFilterSamples.foreground.resolution === ratio, ratio)
      const value = await inspect(); assertNative(value)
      assert.equal(value.width, 960); assert.equal(value.height, 540)
      assert.equal(await page.getByLabel('用户名', { exact: true }).inputValue(), 'quality-fixture')
      observations.push({ name: 'same-css-size-dpr-' + ratio, ...value })
      checks.push('same-css-size-dpr-' + ratio + '-updates-canvas-and-filter-without-remount')
    }
    await session.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 2, mobile: false })
    await page.goto(origin + '/?hour=23'); await page.getByRole('button', { name: /呼唤.*打开登录/ }).waitFor()
    await enter(); const night = await inspect(); assertNative(night)
    observations.push({ name: 'after-night-hidpi', ...night }); await capture('after-night-login-hidpi')
    checks.push('night-character-remains-native-resolution')
    await session.detach()
    assert.deepEqual(errors, [])
    const result = { verifiedAt: new Date().toISOString(), passed: true, checks, observations, snapshots, errors,
      credentials: 'No authentication request; isolated fixture only', dynamicDpr: 'Chromium display-metric emulation with unchanged CSS viewport' }
    await writeFile(path.join(evidence, 'resolution-result.json'), JSON.stringify(result, null, 2))
    t.diagnostic(JSON.stringify({ passed: true, checks, snapshots }))
  } catch (error) {
    await writeFile(path.join(evidence, 'resolution-failure-' + Date.now() + '.json'), JSON.stringify({ error: String(error), errors, runtimeLogs, observations }, null, 2))
    throw error
  } finally {
    await application?.close(); http.closeAllConnections(); await new Promise(resolve => http.close(resolve))
    assert.equal(path.dirname(path.resolve(scratch)), path.resolve(tmpdir())); assert.ok(path.basename(scratch).startsWith('eden-startup-hidpi-'))
    await rm(scratch, { recursive: true, force: true })
  }
})
