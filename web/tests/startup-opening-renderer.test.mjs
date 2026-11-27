import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { _electron } from 'playwright-core'

test('the bundled opening animation reveals the classroom and can be bypassed during cold loading', { timeout: 180000, skip: process.platform !== 'win32' }, async t => {
  const web = fileURLToPath(new URL('../', import.meta.url)), agent = path.resolve(web, '../..')
  const assets = path.join(web, 'public/startup-scene')
  try { await access(path.join(assets, 'manifest.json')) } catch { t.skip('Local startup assets are required'); return }
  const scratch = await mkdtemp(path.join(tmpdir(), 'eden-startup-opening-'))
  const evidenceName = process.env.EDEN_STARTUP_EVIDENCE_NAME || 'startup-opening'
  assert.match(evidenceName, /^[a-z0-9-]+$/)
  const evidence = process.env.EDEN_STARTUP_EVIDENCE_DIR ? path.resolve(process.env.EDEN_STARTUP_EVIDENCE_DIR, evidenceName) : path.join(scratch, evidenceName)
  await mkdir(evidence, { recursive: true })
  const css = await readFile(path.join(web, 'dist/assets', (await readdir(path.join(web, 'dist/assets'))).find(name => name.endsWith('.css'))))
  const errors = [], checks = [], images = [], observations = []
  let application, page, releaseAssets, hold = true
  let gate = new Promise(resolve => { releaseAssets = resolve })
  const http = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://fixture').pathname
      if (pathname === '/startup-opening/eden-opening.html') {
        response.setHeader('content-type', 'text/html; charset=utf-8')
        response.end(await readFile(path.join(web, 'public', '.' + pathname))); return
      }
      if (pathname.startsWith('/startup-scene/')) {
        const name = pathname.slice('/startup-scene/'.length)
        if (name.includes('/') || name.includes('..')) { response.writeHead(404).end(); return }
        if (hold && !name.startsWith('thumb-')) await gate
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
    await page.addInitScript(() => {
      window.openingStates = []
      const inspect = () => {
        const overlay = document.querySelector('[data-startup-opening-overlay]')
        const next = { present: !!overlay, phase: overlay?.getAttribute('data-opening-phase'), playing: overlay?.getAttribute('data-animation-playing') }
        const previous = window.openingStates.at(-1)
        if (!previous || previous.present !== next.present || previous.phase !== next.phase || previous.playing !== next.playing)
          window.openingStates.push({ ...next, at: performance.now() })
      }
      new MutationObserver(inspect).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-opening-phase', 'data-animation-playing'] })
    })
    const origin = `http://127.0.0.1:${http.address().port}/`
    const overlay = page.locator('[data-startup-opening-overlay]')
    const animation = overlay.frameLocator('iframe')
    const actor = page.getByRole('button', { name: '呼唤阿罗娜，打开登录' })
    const capture = async name => {
      const shot = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true })
      const bytes = Buffer.from(shot.data, 'base64'); await writeFile(path.join(evidence, name + '.png'), bytes)
      images.push({ name, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) })
    }
    const states = async name => observations.push({ name, states: await page.evaluate(() => window.openingStates) })
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto(origin)
    await overlay.waitFor()
    assert.equal(await overlay.getAttribute('data-reduced-motion'), 'false')
    assert.equal(await page.getByRole('combobox', { name: '运行模式' }).count(), 0)
    assert.equal(await actor.count(), 0)
    await capture('opening-cold-start')
    await animation.locator('#halo-stage[style*="scale("]').waitFor()
    await capture('opening-cold-midpoint')
    checks.push('the-animation-plays-while-the-classroom-assets-are-cold')
    await page.getByRole('button', { name: '跳过开场动画' }).click()
    await overlay.waitFor({ state: 'detached' })
    await page.getByRole('dialog').waitFor()
    assert.equal(await actor.count(), 0)
    await capture('opening-skipped-to-login')
    checks.push('skip-unlocks-login-without-waiting-for-the-classroom')
    hold = false; releaseAssets()
    await page.getByRole('button', { name: '返回教室' }).click()
    await actor.waitFor()
    assert.equal(await page.locator('[data-startup-renderer]').getAttribute('data-scene-prewarm-frames'), '3')
    await capture('opening-complete'); await states('cold-skip')
    checks.push('return-to-the-prewarmed-room-restores-interaction')
    await page.getByRole('button', { name: '切换为夜晚' }).click()
    await page.getByRole('button', { name: '呼唤普拉娜，打开登录' }).waitFor()
    assert.equal(await overlay.count(), 0)
    checks.push('lighting-switch-does-not-replay-opening')
    await page.goto(origin); await overlay.waitFor()
    await animation.locator('#reveal-sub[style*="opacity: 1;"]').waitFor()
    assert.equal((await animation.locator('.reveal-title').textContent()).trim(), '欢迎回来，老师')
    assert.equal(await animation.locator('#reveal-sub').textContent(), '夏莱终端已就绪')
    await capture('opening-welcome')
    await actor.waitFor(); await states('normal-opening')
    const normal = observations.at(-1).states, start = normal.find(value => value.playing === 'true')
    const reveal = normal.find(value => value.phase === 'revealing')
    assert.ok(reveal)
    assert.ok(start)
    assert.ok(reveal.at - start.at >= 7900)
    assert.ok(reveal.at - start.at < 10500)
    assert.ok(normal.at(-1).at - reveal.at >= 300)
    checks.push('unskipped-opening-plays-before-revealing-room')
    checks.push('the-welcome-text-finishes-before-the-room-reveal')
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1366, 768]]) {
      await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
      await page.goto(origin)
      await overlay.locator('iframe').waitFor()
      assert.equal(await overlay.evaluate(element => {
        const within = selector => {
          const box = element.querySelector(selector).getBoundingClientRect()
          return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
        }
        return within('iframe') && within('button')
      }), true, `Opening content fits ${width}x${height}`)
      assert.equal(await animation.locator('.reveal-title').evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return bounds.left >= 0 && bounds.right <= innerWidth
      }), true, `Welcome text fits ${width}x${height}`)
      await capture(`opening-animation-${width}x${height}`)
    }
    checks.push('animation-and-controls-fit-phone-landscape-and-laptop')
    await page.goto(origin); await overlay.waitFor()
    const palettes = []
    for (const theme of ['cream', 'night', 'navy', 'forest']) {
      await page.evaluate(theme => { document.documentElement.dataset.baseTheme = theme }, theme)
      palettes.push(await animation.locator('.reveal-title').evaluate(element => getComputedStyle(element).color))
    }
    assert.ok(palettes.every(palette => palette === palettes[0]))
    checks.push('opening-welcome-contrast-stays-consistent-across-app-themes')
    hold = true; gate = new Promise(resolve => { releaseAssets = resolve })
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(origin)
    await page.getByRole('button', { name: '继续', exact: true }).waitFor()
    assert.equal(await overlay.locator('iframe').count(), 0)
    await capture('opening-reduced-motion')
    hold = false; releaseAssets(); await actor.waitFor(); await states('reduced-motion')
    assert.equal(observations.at(-1).states.some(value => value.phase === 'revealing'), false)
    assert.equal(await page.locator('[data-startup-phase]').getAttribute('data-startup-opening'), 'false')
    checks.push('reduced-motion-exposes-the-classroom-controls-without-playing-the-animation')
    assert.deepEqual(errors, [])
    const result = { passed: true, verifiedAt: new Date().toISOString(), checks, errors, images, observations, realPrivateAssets: true }
    await writeFile(path.join(evidence, 'opening-result.json'), JSON.stringify(result, null, 2)); t.diagnostic(JSON.stringify(result))
    await session.detach()
  } catch (error) {
    await writeFile(path.join(evidence, 'failure-' + Date.now() + '.json'), JSON.stringify({ error: String(error), errors,
      surface: await page?.evaluate(() => document.body.innerText).catch(() => null) }, null, 2)); throw error
  } finally {
    releaseAssets(); await application?.close(); http.closeAllConnections(); await new Promise(resolve => http.close(resolve))
    assert.equal(path.dirname(path.resolve(scratch)), path.resolve(tmpdir()))
    assert.ok(path.basename(scratch).startsWith('eden-startup-opening-'))
    await rm(scratch, { recursive: true, force: true })
  }
})
