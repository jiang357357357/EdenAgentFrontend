import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { _electron } from 'playwright-core'

test('opening animation covers cold loading, supports skipping and reduced motion, then reveals the ready room', { timeout: 180000, skip: process.platform !== 'win32' }, async t => {
  const web = fileURLToPath(new URL('../', import.meta.url)), agent = path.resolve(web, '../..')
  const readme = await readFile(path.join(agent, 'README.md'), 'utf8')
  const quote = readme.match(/^> “([^”]*与你相会[^”]*)”\r?$/m)?.[1]
  assert.ok(quote, 'The scripture quote must come from the project README')
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
      window.openingCaptionReadyAt = null
      document.addEventListener('animationend', event => {
        if (event.animationName === 'startup-caption-in' && event.target?.classList?.contains('startup-opening-caption'))
          window.openingCaptionReadyAt = performance.now()
      })
      const inspect = () => {
        const overlay = document.querySelector('[data-startup-opening-overlay]')
        const next = { present: !!overlay, phase: overlay?.getAttribute('data-opening-phase'), reduced: overlay?.getAttribute('data-reduced-motion') }
        const previous = window.openingStates.at(-1)
        if (!previous || previous.present !== next.present || previous.phase !== next.phase || previous.reduced !== next.reduced)
          window.openingStates.push({ ...next, at: performance.now() })
      }
      new MutationObserver(inspect).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-opening-phase', 'data-reduced-motion'] })
    })
    const origin = `http://127.0.0.1:${http.address().port}/`
    const overlay = page.locator('[data-startup-opening-overlay]')
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
    assert.equal(await page.locator('.startup-opening-caption').textContent(), quote)
    assert.equal(await page.getByRole('combobox', { name: '运行模式' }).count(), 0)
    assert.equal(await actor.count(), 0)
    const before = await page.locator('.startup-opening-emblem').evaluate(element => getComputedStyle(element).transform)
    await capture('opening-cold-start'); await page.waitForTimeout(280)
    const after = await page.locator('.startup-opening-emblem').evaluate(element => getComputedStyle(element).transform)
    assert.notEqual(before, after)
    await capture('opening-cold-midpoint')
    checks.push('real-css-opening-animates-while-assets-load-and-blocks-underlying-controls')
    await page.getByRole('button', { name: '跳过开场动画' }).click()
    assert.equal(await page.getByRole('button', { name: '跳过开场动画' }).isDisabled(), true)
    assert.equal(await overlay.isVisible(), true)
    assert.equal(await actor.count(), 0)
    await page.waitForTimeout(600)
    await capture('opening-ready-to-reveal')
    checks.push('skip-shortens-opening-but-retains-opaque-cover-until-native-scene-is-ready')
    hold = false; releaseAssets()
    await page.waitForFunction(() => document.querySelector('[data-startup-opening-overlay]')?.getAttribute('data-opening-phase') === 'revealing')
    await capture('opening-revealing')
    await actor.waitFor(); assert.equal(await overlay.count(), 0)
    assert.equal(await page.locator('[data-startup-renderer]').getAttribute('data-scene-prewarm-frames'), '3')
    await capture('opening-complete'); await states('cold-skip')
    checks.push('reveals-only-prewarmed-scene-and-restores-room-interaction')
    await page.getByRole('button', { name: '切换为夜晚' }).click()
    await page.getByRole('button', { name: '呼唤普拉娜，打开登录' }).waitFor()
    assert.equal(await overlay.count(), 0)
    checks.push('lighting-switch-does-not-replay-opening')
    await page.goto(origin); await overlay.waitFor(); await page.waitForTimeout(1450)
    const readableAt = await page.locator('.startup-opening-caption').evaluate(element => {
      if (getComputedStyle(element).opacity !== '1') throw new Error('Opening quote is still hidden')
      if (window.openingCaptionReadyAt === null) throw new Error('Opening caption animation completion was not observed')
      return window.openingCaptionReadyAt
    })
    await capture('opening-quote-reading')
    await actor.waitFor(); await states('normal-opening')
    const normal = observations.at(-1).states, start = normal.find(value => value.present)
    const reveal = normal.find(value => value.phase === 'revealing')
    assert.ok(reveal)
    assert.ok(reveal.at - start.at >= 2350)
    assert.ok(normal.at(-1).at - reveal.at >= 750)
    assert.ok(reveal.at - readableAt >= 600)
    checks.push('unskipped-opening-plays-before-revealing-room')
    checks.push('scripture-matches-readme-and-stays-fully-visible-before-the-room-reveal')
    hold = true; gate = new Promise(resolve => { releaseAssets = resolve })
    await session.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(origin)
    await overlay.waitFor()
    assert.equal(await overlay.getAttribute('data-reduced-motion'), 'true')
    assert.equal(await page.locator('.startup-opening-emblem').evaluate(element => getComputedStyle(element).animationName), 'none')
    await capture('opening-reduced-motion-phone')
    assert.equal(await overlay.evaluate(element => [...element.querySelectorAll('*')].every(child =>
      getComputedStyle(child).animationName === 'none')), true)
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1366, 768]]) {
      await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
      assert.equal(await overlay.evaluate(element => {
        const within = selector => {
          const box = element.querySelector(selector).getBoundingClientRect()
          return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
        }
        const caption = element.querySelector('.startup-opening-caption').getBoundingClientRect()
        const button = element.querySelector('button').getBoundingClientRect()
        return within('.startup-opening-emblem') && within('.startup-opening-caption') && within('button') &&
          (caption.bottom < button.top || caption.right < button.left)
      }), true, `Opening content fits ${width}x${height}`)
      await capture(`opening-static-${width}x${height}`)
    }
    checks.push('all-decoration-stops-in-reduced-motion-and-content-fits-phone-landscape-and-laptop')
    const palettes = []
    for (const theme of ['cream', 'night', 'navy', 'forest']) {
      palettes.push(await page.evaluate(theme => {
        document.documentElement.dataset.baseTheme = theme
        return {
          sky: getComputedStyle(document.querySelector('.startup-opening-sky')).backgroundImage,
          orbit: getComputedStyle(document.querySelector('.startup-opening-ring-line')).stroke,
          text: getComputedStyle(document.querySelector('.startup-opening-caption')).color,
        }
      }, theme))
    }
    assert.ok(palettes.every(palette => JSON.stringify(palette) === JSON.stringify(palettes[0])))
    checks.push('opening-lighting-and-quote-contrast-stay-consistent-across-light-and-dark-themes')
    hold = false; releaseAssets(); await actor.waitFor(); await states('reduced-motion')
    assert.equal(observations.at(-1).states.some(value => value.phase === 'revealing'), false)
    assert.equal(await page.locator('[data-startup-phase]').getAttribute('data-startup-opening'), 'false')
    checks.push('reduced-motion-uses-static-cover-without-minimum-playback-or-fade')
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
