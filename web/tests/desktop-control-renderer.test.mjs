import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { build } from 'esbuild'
import { _electron } from 'playwright-core'

test('desktop controls use real RPC and show active, paused, stopped and error states', { timeout: 60000, skip: process.platform !== 'win32' }, async () => {
  const web = fileURLToPath(new URL('../', import.meta.url)), agent = path.resolve(web, '../..')
  const scratch = await mkdtemp(path.join(tmpdir(), 'eden-desktop-control-ui-'))
  const evidence = path.join(agent, '.artifacts/desktop-control-20261022/renderer')
  await mkdir(evidence, { recursive: true })
  const css = await readFile(path.join(web, 'dist/assets', (await readdir(path.join(web, 'dist/assets'))).find(n => n.endsWith('.css'))))
  const status = { available: true, busy: false, paused: false, stopped: false, observerAvailable: true, operations: [], control: undefined }
  const requests = [], errors = []
  let application, rejectControl = false
  const server = createServer(async (request, response) => {
    if (request.url === '/style.css') { response.setHeader('content-type', 'text/css'); response.end(css); return }
    if (request.url === '/fixture.js') { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(path.join(scratch, 'fixture.js'))); return }
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.end('<html data-base-theme="cream"><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script>localStorage.setItem("agent.runtime_origin","local")</script><script src="/fixture.js"></script></body></html>')
  })
  const ws = new WebSocketServer({ server, path: '/rpc' })
  ws.on('connection', socket => socket.on('message', raw => {
    const message = JSON.parse(String(raw)); requests.push(message)
    const reply = result => socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
    if (message.method === 'initialize') return reply({ protocolVersion: 2, serverName: 'fixture', serverVersion: 'test', agentCoreVersion: 'test', runtimeOrigin: 'local', capabilities: ['desktop.status', 'desktop.control'] })
    if (message.method === 'desktop.status') return reply(status)
    if (message.method === 'desktop.control') {
      if (rejectControl) { socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'fixture control failure' } })); return }
      status.paused = message.params.action === 'pause'; status.stopped = message.params.action === 'stop'
      status.control = { action: message.params.action, source: 'manual', changedAt: Date.now(),
        message: message.params.action === 'pause' ? '用户在控制窗口暂停了桌面控制' : '用户在控制窗口更新了桌面控制' }
      status.busy = false; status.operations = []
      return reply(status)
    }
    throw new Error('Unexpected fixture RPC: ' + message.method)
  }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const origin = `http://127.0.0.1:${server.address().port}`
    await build({ absWorkingDir: web, entryPoints: ['tests/fixtures/desktop-control-renderer.tsx'], outfile: path.join(scratch, 'fixture.js'),
      bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
      define: { 'import.meta.env': JSON.stringify({ DEV: true, VITE_EDEN_AGENT_LOCAL_BASE_URL: origin, VITE_EDEN_AGENT_LOCAL_CAPABILITY_TOKEN: 'synthetic-fixture' }) } })
    const main = path.join(scratch, 'main.cjs')
    await writeFile(main, `const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(scratch, 'profile'))});app.on('window-all-closed',()=>{});app.whenReady().then(()=>new BrowserWindow({show:false,width:960,height:540,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}}).loadURL('about:blank'));`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    application = await _electron.launch({ executablePath: path.join(agent, 'node_modules/electron/dist/electron.exe'), args: [main], env })
    const page = await application.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin)
    await page.getByRole('heading', { name: '桌面控制验收' }).waitFor()
    const bar = page.getByRole('complementary', { name: '桌面控制' })
    assert.equal(await bar.count(), 0)
    status.busy = true; status.operations = [{ sessionId: 'fixture', action: 'desktop_type', windowTitle: '临时记事本', state: 'running', startedAt: Date.now() }]
    await bar.waitFor(); await page.getByText('临时记事本', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(evidence, 'active.png') })
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    await page.getByText('桌面控制已暂停', { exact: true }).waitFor()
    await page.getByText('用户在控制窗口暂停了桌面控制', { exact: true }).waitFor()
    await page.getByRole('button', { name: '恢复', exact: true }).click(); await bar.waitFor({ state: 'hidden' })
    status.busy = true
    await bar.waitFor(); await page.getByRole('button', { name: '停止', exact: true }).click()
    await page.getByText('桌面控制已停止', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(evidence, 'stopped.png') })
    rejectControl = true; await page.getByRole('button', { name: '恢复', exact: true }).click()
    await page.getByText(/fixture control failure/).waitFor()
    rejectControl = false; await page.getByRole('button', { name: '恢复', exact: true }).click(); await bar.waitFor({ state: 'hidden' })
    status.paused = true; status.control = { action: 'pause', source: 'physical_input', changedAt: Date.now(), message: '检测到本机输入，已暂停桌面控制' }; await bar.waitFor()
    await page.getByText('检测到本机输入，已暂停桌面控制', { exact: true }).waitFor()
    await page.setViewportSize({ width: 390, height: 700 })
    await page.screenshot({ path: path.join(evidence, 'mobile-paused.png') })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await page.addInitScript(() => { window.edenAgentDesktop = { desktopControlWindow: true } })
    await page.reload(); await page.getByRole('heading', { name: '桌面控制验收' }).waitFor()
    const reads = requests.filter(r => r.method === 'desktop.status').length
    await new Promise(resolve => setTimeout(resolve, 1100))
    assert.equal(await bar.count(), 0, 'Native desktops use the independent window instead of embedding the browser bar')
    assert.equal(requests.filter(r => r.method === 'desktop.status').length, reads, 'The main renderer must not duplicate native status polling')
    assert.deepEqual(errors, [])
    await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, errors, desktopEmbeddedBarHidden: true,
      controls: requests.filter(r => r.method === 'desktop.control').map(r => r.params.action) }, null, 2))
  } finally {
    await application?.close(); for (const client of ws.clients) client.terminate()
    await new Promise(resolve => ws.close(resolve)); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    assert.equal(path.dirname(scratch), path.resolve(tmpdir())); assert.ok(path.basename(scratch).startsWith('eden-desktop-control-ui-'))
    await rm(scratch, { recursive: true, force: true })
  }
})
