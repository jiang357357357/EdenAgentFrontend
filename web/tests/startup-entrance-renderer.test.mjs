import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { _electron } from 'playwright-core'

test('original Spine entrance effects, ordered stages, login and return run in an isolated Electron renderer', { timeout: 300000, skip: process.platform !== 'win32' }, async t => {
  const web = fileURLToPath(new URL('../', import.meta.url)), agent = path.resolve(web, '../..')
  const assets = path.join(web, 'public/startup-scene')
  try { await access(path.join(assets, 'manifest.json')) }
  catch { t.skip('Prepare the local startup assets before renderer acceptance'); return }
  const scratch = await mkdtemp(path.join(tmpdir(), 'eden-startup-scene-'))
  const evidenceName = process.env.EDEN_STARTUP_EVIDENCE_NAME ?? 'startup-mode-selector-20261021'
  assert.match(evidenceName, /^[a-z0-9-]+$/)
  const evidence = path.join(agent, '.artifacts', evidenceName)
  await mkdir(evidence, { recursive: true })
  let application, page, loginCalls = 0, coreLoginCalls = 0
  const assetRequests = [], traces = [], captures = []
  const runtimeLogs = []
  const cssName = (await readdir(path.join(web, 'dist/assets'))).find(name => name.endsWith('.css'))
  const css = await readFile(path.join(web, 'dist/assets', cssName))
  const http = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://fixture').pathname
      if (pathname === '/core-api/api/users/login/') {
        let body = ''; for await (const chunk of request) body += chunk
        const value = JSON.parse(body); coreLoginCalls++
        response.setHeader('content-type', 'application/json')
        if (value.username !== 'fixture' || value.password !== 'fixture-pass') { response.writeHead(401).end('{"error":"invalid fixture credentials"}'); return }
        response.end(JSON.stringify({ message: 'fixture login', token: 'synthetic-startup-token', expires_at: '2099-01-01T00:00:00Z', expires_in: 3600,
          user: { id: 1, username: 'fixture', is_staff: false, is_superuser: false } })); return
      }
      if (pathname === '/fixture/login') {
        let body = ''; for await (const chunk of request) body += chunk
        loginCalls++
        const value = JSON.parse(body)
        response.writeHead(value.username === 'fixture' && value.password === 'fixture-pass' ? 200 : 401).end('{}'); return
      }
      if (pathname.startsWith('/startup-scene/')) {
        assetRequests.push(pathname)
        const name = pathname.slice('/startup-scene/'.length)
        if (name.includes('/') || name.includes('..')) { response.writeHead(404).end(); return }
        response.setHeader('content-type', name.endsWith('.png') ? 'image/png' : 'application/octet-stream')
        response.end(await readFile(path.join(assets, name))); return
      }
      if (pathname === '/style.css') { response.setHeader('content-type', 'text/css'); response.end(css); return }
      if (/\.(?:js|css|png|jpg|svg)$/.test(pathname)) {
        const filename = path.resolve(scratch, '.' + pathname)
        if (path.dirname(filename) !== scratch) { response.writeHead(404).end(); return }
        response.setHeader('content-type', pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'image/png')
        response.end(await readFile(filename)); return
      }
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end('<!doctype html><html lang="zh-CN" data-base-theme="cream"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="margin:0"><div id="root"></div><script src="/renderer.js"></script></body></html>')
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${http.address().port}`
  const checks = []
  try {
    await build({ absWorkingDir: web, entryPoints: ['tests/fixtures/startup-entrance-renderer.tsx'],
      outfile: path.join(scratch, 'renderer.js'), bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic',
      loader: { '.png': 'file', '.jpg': 'file', '.svg': 'file' }, logLevel: 'silent', define: {
        __MON_AUTH_MODE__: '"production"', 'import.meta.env': JSON.stringify({ DEV: true,
          VITE_EDEN_AGENT_MON_BASE_URL: origin, VITE_EDEN_AGENT_LOCAL_BASE_URL: origin }),
      } })
    const main = path.join(scratch, 'main.cjs')
    await writeFile(main, `const{app,BrowserWindow}=require('electron');app.disableHardwareAcceleration();app.commandLine.appendSwitch('enable-unsafe-swiftshader');app.commandLine.appendSwitch('force-device-scale-factor','1');app.setPath('userData',${JSON.stringify(path.join(scratch, 'profile'))});app.on('window-all-closed',()=>{});app.whenReady().then(()=>{const window=new BrowserWindow({show:false,useContentSize:true,width:960,height:540,webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true}});window.webContents.setFrameRate(30);let paints=0;window.webContents.on('paint',()=>paints++);globalThis.capture=async filename=>{const before=await window.webContents.executeJavaScript("JSON.parse(document.querySelector('[data-startup-renderer]')?.dataset.sceneFrame||'null')");const image=await new Promise((resolve,reject)=>{const listener=(_e,_rect,image)=>{clearTimeout(timer);resolve(image)};const timer=setTimeout(()=>{window.webContents.removeListener('paint',listener);reject(new Error('No new offscreen paint'))},5000);window.webContents.once('paint',listener);window.webContents.invalidate()});require('node:fs').writeFileSync(filename,image.toPNG());return{before,paints,size:image.getSize()}};window.loadURL('about:blank')});`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    application = await _electron.launch({ executablePath: path.join(agent, 'node_modules/electron/dist/electron.exe'), args: [main], env })
    page = await application.firstWindow()
    const pageErrors = [], graphicsErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => { if (['warn', 'warning', 'error'].includes(message.type())) runtimeLogs.push({ type: message.type(), message: message.text() }) })
    page.on('console', message => { if (message.type() === 'error' && /shader|WebGL|Pixi|INVALID_/i.test(message.text())) graphicsErrors.push(message.text()) })
    page.setDefaultTimeout(20000)
    await page.goto(origin)
    const phase = value => page.locator(`[data-startup-phase="${value}"]`)
    const capture = async (name, settle = true) => {
      if (settle) await page.waitForTimeout(350)
      // Hidden acceptance windows can suspend CSS compositor timelines. Settle
      // only finite CSS transitions for screenshots; Spine ticks remain real.
      if (settle) await page.evaluate(() => { for (const animation of document.getAnimations()) {
        if (Number.isFinite(Number(animation.effect?.getTiming().iterations))) animation.finish()
      } })
      const observation = await application.evaluate(async (_electron, filename) => globalThis.capture(filename), path.join(evidence, name + '.png'))
      captures.push({ name, ...observation })
    }
    const frame = () => page.locator('[data-startup-renderer]').evaluate(element => JSON.parse(element.dataset.sceneFrame))
    const checkBubble = async name => {
      const bubble = page.getByRole('button', { name: `听${name}说下一句` })
      await bubble.waitFor()
      const box = await bubble.boundingBox(), viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      assert.ok(box && box.x >= 0 && box.y >= 76 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height)
      const toolbar = await page.getByRole('group', { name: '场景控制' }).boundingBox()
      const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
      assert.equal(overlap(box, toolbar), false)
      if (viewport.width >= 640) assert.equal(overlap(box, await page.getByRole('button', { name: `呼唤${name}，打开登录` }).boundingBox()), false)
      const idleLine = await bubble.getByRole('status').textContent()
      assert.ok(idleLine.length > 5)
      assert.doesNotMatch(idleLine, /欢迎|老师|早上好|晚上好|您好|来啦/)
    }
    const activate = async (name, prefix) => {
      const button = page.getByRole('button', { name: `呼唤${name}，打开登录` })
      await button.waitFor(); const box = await button.boundingBox()
      assert.ok(box && box.width > 20 && box.height > 20)
      assert.equal(await page.locator('[data-startup-renderer]').getAttribute('data-scene-prewarm-frames'), '3')
      const requestsBefore = assetRequests.length
      await page.evaluate(prefix => {
        window.startupTrace = []
        window.stageShots = {}
        window.traceObserver?.disconnect()
        window.traceObserver = new MutationObserver(() => {
          const value = document.querySelector('[data-startup-renderer]')?.dataset.sceneFrame
          if (!value) return
          const frame = JSON.parse(value)
          window.startupTrace.push(frame)
          if (prefix && ['reacting', 'exit-flash', 'enter-flash'].includes(frame.phase) && !window.stageShots[frame.phase]) {
            if (frame.phase === 'reacting' && frame.elapsed < .2) return
            if (frame.phase === 'enter-flash' && frame.foregroundAlpha < .1) return
            window.stageShots[frame.phase] = { frame, data: document.querySelector('canvas').toDataURL('image/png') }
          }
        })
        window.traceObserver.observe(document.querySelector('[data-startup-renderer]'), { attributes: true, attributeFilter: ['data-scene-frame'] })
      }, prefix)
      await button.click(); await phase('reacting').waitFor()
      assert.equal(await page.locator('[data-startup-dialogue]').count(), 0)
      assert.equal(await page.getByRole('group', { name: '场景控制' }).locator('button:enabled').count(), 0)
      assert.equal(await page.getByRole('dialog').count(), 0)
      await phase('login').waitFor(); await page.getByRole('dialog').waitFor()
      const greeting = page.getByRole('dialog').locator('[data-startup-login-dialogue]')
      await greeting.waitFor()
      assert.ok((await greeting.textContent()).includes(name))
      assert.match(await greeting.getByRole('status').textContent(), /欢迎.*老师|老师.*欢迎/)
      assert.equal(await greeting.evaluate(element => element.closest('[data-startup-login-panel]') === null), true)
      const greetingBox = await greeting.boundingBox(), formBox = await page.locator('[data-startup-login-panel]').boundingBox()
      const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
      assert.equal(overlaps(greetingBox, formBox), false, 'character dialogue must stay outside the login form')
      const foreground = JSON.parse(await page.locator('[data-startup-renderer]').getAttribute('data-scene-foreground-bounds'))
      assert.ok(foreground)
      const head = { x: foreground.x + foreground.width * .2, y: foreground.y,
        width: foreground.width * .6, height: Math.min(160, foreground.height * .28) }
      assert.equal(overlaps(greetingBox, head), false, 'welcome dialogue must not cover the character head')
      assert.ok(Math.abs(greetingBox.y + greetingBox.height / 2 - head.y - head.height / 2) < 220)
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      assert.ok(greetingBox.x >= 0 && greetingBox.y >= 76 && greetingBox.x + greetingBox.width <= viewport.width && greetingBox.y + greetingBox.height <= viewport.height)
      assert.equal(await page.locator('[data-startup-dialogue]').count(), 0)
      const { samples, shots } = await page.evaluate(() => { window.traceObserver.disconnect(); return { samples: window.startupTrace, shots: window.stageShots } })
      const exit = samples.find(sample => sample.phase === 'exit-flash')
      assert.ok(exit)
      assert.equal(exit.actorAlpha, 0); assert.equal(exit.foregroundAlpha, 0); assert.ok(exit.exitFlash > 0)
      assert.ok(exit.touchTrackTime <= exit.reactionDuration - 1 / 30 + 1e-5)
      const entry = samples.find(sample => sample.phase === 'enter-flash' && sample.foregroundAlpha > .1)
      assert.ok(entry && entry.entryFlash > 0)
      for (const [phase, shot] of Object.entries(shots)) {
        const name = prefix + '-' + (phase === 'reacting' ? 'reaction' : phase)
        await writeFile(path.join(evidence, name + '.png'), Buffer.from(shot.data.split(',')[1], 'base64'))
        captures.push({ name, kind: 'actual-Pixi-canvas-frame', before: shot.frame })
      }
      const stages = [...new Set(samples.map(sample => sample.phase).filter(phase => phase !== 'room'))]
      assert.deepEqual(stages, ['reacting', 'exit-flash', 'enter-flash', 'login'])
      const stable = await frame()
      assert.ok(stable.elapsed >= stable.reactionDuration + 1.1 - .001)
      assert.equal(stable.foregroundAlpha, 1); assert.equal(stable.entryFlash, 0); assert.equal(stable.blur, 1)
      assert.equal(assetRequests.length, requestsBefore, 'characters must already be loaded before clicking')
      const layout = await page.locator('[data-startup-renderer]').evaluate(element => ({
        bounds: JSON.parse(element.dataset.sceneForegroundBounds), protected: JSON.parse(element.dataset.sceneProtectedAreas),
      }))
      if (layout.bounds) for (const control of layout.protected) {
        const a = layout.bounds, b = control
        assert.equal(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height, false)
      }
      traces.push({ name, prefix, stages, samples, layout })
    }
    await page.getByRole('button', { name: '呼唤阿罗娜，打开登录' }).or(page.getByRole('dialog')).first().waitFor()
    assert.equal(await page.getByRole('button', { name: '呼唤阿罗娜，打开登录' }).count(), 1, JSON.stringify(runtimeLogs))
    await checkBubble('阿罗娜')
    const firstLine = await page.locator('[data-startup-dialogue] [role="status"]').textContent()
    const dialogueRequests = assetRequests.length
    await page.getByRole('button', { name: '听阿罗娜说下一句' }).click()
    assert.notEqual(await page.locator('[data-startup-dialogue] [role="status"]').textContent(), firstLine)
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(assetRequests.length, dialogueRequests)
    checks.push('character-dialogue-advances-locally-without-opening-login-or-loading-assets')
    assert.equal(await page.getByRole('button', { name: '直接登录' }).count(), 0)
    assert.equal(await page.locator('[data-startup-phase] footer').count(), 0)
    const mode = page.getByRole('combobox', { name: '运行模式' })
    const modeBox = await mode.boundingBox()
    assert.ok(modeBox && modeBox.x < 960 * .4 && modeBox.y < 100)
    assert.equal(await mode.inputValue(), 'mon')
    await mode.selectOption('local'); await phase('room').waitFor()
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(await mode.inputValue(), 'local')
    await mode.selectOption('mon')
    checks.push('upper-left-mode-selector-does-not-open-login-before-character-click')
    await capture('day-room')
    await activate('阿罗娜', 'day'); await capture('day-login')
    checks.push('idle-dialogue-is-casual-and-login-dialogue-greets-the-teacher')
    checks.push('login-greeting-is-next-to-foreground-character-outside-form-and-clear-of-face')
    assert.equal(await mode.isDisabled(), true)
    assert.equal(await page.getByRole('group', { name: '选择运行世界' }).count(), 0)
    checks.push('login-has-no-duplicate-mode-switch-and-selector-is-locked')
    checks.push('day-original-reaction-exit-flash-entry-flash-login-order')
    await page.evaluate(() => {
      window.returnFrames = []; window.returnShot = null
      window.returnObserver = new MutationObserver(() => {
        const value = JSON.parse(document.querySelector('[data-startup-renderer]').dataset.sceneFrame)
        window.returnFrames.push(value)
        if (value.phase === 'returning' && value.foregroundAlpha > 0 && value.foregroundAlpha < 1 && !window.returnShot)
          window.returnShot = { frame: value, data: document.querySelector('canvas').toDataURL('image/png') }
      })
      window.returnObserver.observe(document.querySelector('[data-startup-renderer]'), { attributes: true, attributeFilter: ['data-scene-frame'] })
    })
    await page.getByRole('button', { name: '返回教室' }).click()
    await phase('room').waitFor()
    assert.equal(await mode.isEnabled(), true)
    assert.equal(await page.getByRole('dialog').count(), 0)
    const returned = await page.evaluate(() => { window.returnObserver.disconnect(); return { frames: window.returnFrames, shot: window.returnShot } })
    await checkBubble('阿罗娜')
    assert.equal(await page.locator('[data-startup-login-dialogue]').count(), 0)
    assert.ok(returned.shot)
    await writeFile(path.join(evidence, 'day-returning.png'), Buffer.from(returned.shot.data.split(',')[1], 'base64'))
    captures.push({ name: 'day-returning', kind: 'actual-Pixi-canvas-frame', before: returned.shot.frame })
    traces.push({ name: 'return', samples: returned.frames })
    assert.equal((await frame()).actorAlpha, 1); assert.equal((await frame()).foregroundAlpha, 0)
    checks.push('original-quarter-second-return-crossfade')
    assert.equal(await page.locator('canvas').count(), 1)
    await activate('阿罗娜')
    checks.push('return-and-repeat-with-single-room-renderer')
    await page.getByLabel('用户名', { exact: true }).fill('fixture')
    await page.getByLabel('密码', { exact: true }).fill('wrong')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '用户名或密码错误' }).waitFor()
    assert.equal(await page.locator('[data-startup-complete]').count(), 0)
    await page.getByLabel('密码', { exact: true }).fill('fixture-pass')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('[data-startup-complete="mon"]').waitFor()
    assert.equal(await page.locator('canvas').count(), 0)
    checks.push('failed-login-retains-form-and-success-disposes-scenes')
    await page.goto(origin + '/?hour=23')
    await page.getByRole('button', { name: '呼唤普拉娜，打开登录' }).waitFor(); await capture('night-room')
    await checkBubble('普拉娜')
    await activate('普拉娜', 'night'); await capture('night-login')
    checks.push('night-original-reaction-exit-flash-entry-flash-login-order')
    await page.getByRole('button', { name: '返回教室' }).click(); await phase('room').waitFor()
    await page.getByRole('button', { name: '呼唤普拉娜，打开登录' }).click()
    await phase('reacting').waitFor(); await page.keyboard.press('Escape'); await phase('room').waitFor()
    await page.waitForTimeout(1800)
    assert.equal(await page.getByRole('dialog').count(), 0)
    checks.push('escape-cancels-reaction-without-late-login')
    await page.getByRole('button', { name: '呼唤普拉娜，打开登录' }).click()
    await phase('exit-flash').waitFor(); await page.keyboard.press('Escape'); await phase('room').waitFor()
    await page.waitForTimeout(1100)
    assert.equal(await page.getByRole('dialog').count(), 0)
    checks.push('escape-during-exit-flash-restores-room-without-late-entry')
    await mode.selectOption('local')
    assert.equal(await page.getByRole('dialog').count(), 0)
    await capture('local-room')
    await activate('普拉娜'); await capture('local-entry')
    assert.equal(await page.getByLabel('用户名', { exact: true }).count(), 0)
    await page.getByRole('button', { name: '返回教室' }).click(); await phase('room').waitFor()
    assert.equal(await mode.inputValue(), 'local')
    await activate('普拉娜')
    checks.push('selected-local-mode-survives-return-and-reopens-matching-info-panel')
    await page.getByRole('button', { name: '进入尘世' }).click()
    await page.locator('[data-startup-complete="local"]').waitFor()
    assert.equal(loginCalls, 2)
    checks.push('local-entry-needs-no-core-login')
    await page.goto(origin + '/?cached=1')
    await activate('阿罗娜')
    await page.getByRole('button', { name: '进入伊甸园' }).click()
    await page.locator('[data-startup-complete="mon"]').waitFor()
    assert.equal(loginCalls, 2)
    checks.push('existing-authentication-remains-reusable')
    await page.goto(origin + '/?missing=1')
    await phase('login').waitFor(); await page.getByLabel('用户名', { exact: true }).waitFor()
    checks.push('missing-assets-fall-back-to-login')
    await page.getByRole('button', { name: '返回教室' }).click(); await phase('room').waitFor()
    await mode.selectOption('local'); await page.getByRole('button', { name: '打开登录', exact: true }).click()
    await page.getByRole('button', { name: '进入尘世' }).click()
    await page.locator('[data-startup-complete="local"]').waitFor()
    assert.equal(loginCalls, 2)
    checks.push('missing-assets-still-allow-changing-mode-and-local-entry')
    await page.setViewportSize({ width: 390, height: 844 })
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(390, 844))
    await page.goto(origin + '/?hour=12')
    await page.getByRole('button', { name: '呼唤阿罗娜，打开登录' }).waitFor()
    await checkBubble('阿罗娜'); await capture('mobile-room'); await activate('阿罗娜')
    await capture('mobile-login')
    const geometry = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth,
      frame: JSON.parse(document.querySelector('[data-startup-renderer]').dataset.sceneFrame),
      foreground: JSON.parse(document.querySelector('[data-startup-renderer]').dataset.sceneForegroundBounds) }))
    assert.ok(geometry.documentWidth <= geometry.width)
    assert.equal(geometry.frame.blur, 1)
    if (geometry.foreground) assert.ok(geometry.foreground.y < 844 - 160)
    checks.push('mobile-login-no-page-overflow-and-no-character-over-controls')
    await page.setViewportSize({ width: 960, height: 540 })
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(960, 540))
    await page.goto(origin + '/?hour=12')
    const sun = page.getByRole('button', { name: '切换为白天', exact: true })
    const moon = page.getByRole('button', { name: '切换为夜晚', exact: true })
    const action = page.getByRole('button', { name: '切换角色动作', exact: true })
    await page.getByRole('button', { name: '呼唤阿罗娜，打开登录' }).waitFor()
    assert.equal(await page.getByText('什亭之匣', { exact: true }).count(), 0)
    assert.equal(await page.getByRole('group', { name: '场景控制' }).getByRole('button').count(), 3)
    assert.equal(await sun.getAttribute('aria-pressed'), 'true')
    checks.push('scene-title-replaced-by-three-labelled-icon-buttons')
    for (const hour of [12, 23]) {
      const night = hour === 23, name = night ? '普拉娜' : '阿罗娜', count = night ? 5 : 4
      if (night) await moon.click()
      await page.getByRole('button', { name: `呼唤${name}，打开登录` }).waitFor()
      assert.equal(await moon.getAttribute('aria-pressed'), String(night))
      assert.equal(await sun.getAttribute('aria-pressed'), String(!night))
      const requests = assetRequests.length
      await page.evaluate(() => { window.poseCanvas = document.querySelector('canvas') })
      for (let index = 0; index < count; index++) {
        const pose = (index + 2) % count, prefix = `${night ? 'night' : 'day'}-pose-${pose}`
        await page.waitForFunction(expected => JSON.parse(document.querySelector('[data-startup-renderer]').dataset.sceneFrame).pose === expected, `Idle_0${pose}`)
        await checkBubble(name)
        await capture(prefix + '-room')
        await activate(name); await capture(prefix + '-login')
        assert.equal(await page.getByRole('group', { name: '场景控制' }).locator('button:enabled').count(), 0)
        checks.push(prefix + '-original-stage-order-and-control-clearance')
        await page.getByRole('button', { name: '返回教室' }).click(); await phase('room').waitFor()
        await action.click()
      }
      await page.waitForFunction(() => JSON.parse(document.querySelector('[data-startup-renderer]').dataset.sceneFrame).pose === 'Idle_02')
      assert.equal(assetRequests.length, requests, 'changing poses must reuse all loaded assets')
      assert.equal(await page.evaluate(() => window.poseCanvas === document.querySelector('canvas')), true)
      checks.push(`${night ? 'night' : 'day'}-action-button-cycles-all-poses-without-reloading-assets-or-canvas`)
      await action.click() // Remember a different pose in each scene.
    }
    await action.click(); await sun.click()
    await page.getByRole('button', { name: '呼唤阿罗娜，打开登录' }).waitFor()
    assert.equal((await frame()).pose, 'Idle_03')
    await moon.click(); await page.getByRole('button', { name: '呼唤普拉娜，打开登录' }).waitFor()
    assert.equal((await frame()).pose, 'Idle_04')
    await action.focus(); await page.keyboard.press('Space')
    await page.waitForFunction(() => JSON.parse(document.querySelector('[data-startup-renderer]').dataset.sceneFrame).pose === 'Idle_00')
    checks.push('scene-switch-preserves-each-characters-pose-and-action-button-supports-keyboard')
    await sun.click(); await moon.click(); await sun.click(); await moon.click()
    await page.getByRole('button', { name: '呼唤普拉娜，打开登录' }).waitFor()
    assert.equal(await page.locator('canvas').count(), 1)
    assert.equal(await page.locator('[data-startup-phase]').getAttribute('data-startup-scene'), 'night')
    checks.push('rapid-lighting-switch-keeps-only-latest-scene-and-one-canvas')
    await page.goto(origin + '/?missing=1')
    await phase('login').waitFor(); await page.getByRole('button', { name: '返回教室' }).click(); await phase('room').waitFor()
    assert.equal(await action.isDisabled(), true)
    await moon.click(); await page.getByRole('button', { name: '呼唤普拉娜，打开登录' }).waitFor()
    assert.equal(await action.isEnabled(), true)
    checks.push('failed-scene-can-recover-by-switching-lighting')
    await page.goto(origin + '/?fullApp=1&page=settings')
    await page.getByText('请在 Eden Agent 主窗口选择运行方式，此窗口会自动同步状态。').waitFor()
    assert.equal(await page.locator('[data-startup-phase]').count(), 0)
    checks.push('actual-app-auxiliary-window-bypasses-entrance')
    await page.goto(origin + '/?fullApp=1')
    await phase('room').waitFor(); await page.getByRole('button', { name: /呼唤.*打开登录/ }).waitFor()
    checks.push('actual-app-main-window-starts-in-character-scene')
    await mode.selectOption('local')
    assert.equal(await page.evaluate(() => localStorage.getItem('agent.runtime_origin')), 'local')
    assert.equal(await page.getByRole('dialog').count(), 0)
    await mode.selectOption('mon')
    assert.equal(await page.evaluate(() => localStorage.getItem('agent.runtime_origin')), 'mon')
    checks.push('actual-app-mode-selector-persists-world-without-entering-main-surface')
    await page.getByRole('button', { name: /呼唤.*打开登录/ }).click(); await phase('login').waitFor()
    await page.getByLabel('用户名', { exact: true }).fill('fixture')
    await page.getByLabel('密码', { exact: true }).fill('fixture-pass')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('[data-startup-phase]'))
    assert.equal(coreLoginCalls, 1)
    assert.equal(await page.evaluate(() => localStorage.getItem('agent.runtime_origin')), 'mon')
    checks.push('actual-app-login-uses-core-authentication-and-enters-main-surface')
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(graphicsErrors, [])
    const result = { verifiedAt: new Date().toISOString(), passed: true, checks, pageErrors, fixtureLoginCalls: loginCalls, coreLoginCalls,
      graphicsErrors, realPrivateAssets: true, mocked: 'Only authentication responses; actual React, Pixi, Spine models, shaders and original transition timeline', geometry }
    await writeFile(path.join(evidence, 'stage-traces.json'), JSON.stringify(traces, null, 2))
    await writeFile(path.join(evidence, 'capture-observations.json'), JSON.stringify(captures, null, 2))
    await writeFile(path.join(evidence, 'renderer-result.json'), JSON.stringify(result, null, 2))
    t.diagnostic(JSON.stringify(result))
  } catch (error) {
    const failure = { at: new Date().toISOString(), error: String(error), runtimeLogs, assetRequests,
      surface: await page?.evaluate(() => ({ text: document.body.innerText, html: document.querySelector('[data-startup-phase]')?.outerHTML })).catch(() => null) }
    await writeFile(path.join(evidence, 'failure-' + Date.now() + '.json'), JSON.stringify(failure, null, 2))
    throw error
  } finally {
    await application?.close(); http.closeAllConnections(); await new Promise(resolve => http.close(resolve))
    assert.equal(path.dirname(path.resolve(scratch)), path.resolve(tmpdir()))
    assert.ok(path.basename(scratch).startsWith('eden-startup-scene-'))
    await rm(scratch, { recursive: true, force: true })
  }
})
