import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { build } from 'esbuild'
import { _electron } from 'playwright-core'

test('real sockets reproduce the first-connect recovery notice and only actual recovery notifies after the fix', {
  timeout: 90000, skip: process.platform !== 'win32',
}, async t => {
  const web = fileURLToPath(new URL('../', import.meta.url)), agent = path.resolve(web, '../..')
  const scratch = await mkdtemp(path.join(tmpdir(), 'eden-connection-notice-'))
  const evidence = path.join(agent, '.artifacts/connection-notice-20261022')
  await mkdir(evidence, { recursive: true })
  const css = await readFile(path.join(web, 'dist/assets', (await readdir(path.join(web, 'dist/assets'))).find(name => name.endsWith('.css'))))
  let application, page, holdRecovery = false, failC = false
  const connections = [], pending = [], requests = [], checks = [], errors = []
  const http = createServer(async (request, response) => {
    try {
      if (request.url === '/style.css') { response.setHeader('content-type', 'text/css'); response.end(css); return }
      if (['/baseline.js', '/fixed.js'].includes(request.url)) {
        response.setHeader('content-type', 'text/javascript'); response.end(await readFile(path.join(scratch, request.url.slice(1)))); return
      }
      const mode = request.url === '/baseline' ? 'baseline' : 'fixed'
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end(`<html data-base-theme="cream"><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><body style="margin:0"><div id="root"></div><script>localStorage.setItem('agent.runtime_origin','local')</script><script src="/${mode}.js"></script></body></html>`)
    } catch { response.writeHead(404).end() }
  })
  const ws = new WebSocketServer({ server: http, path: '/rpc' })
  ws.on('connection', socket => {
    const connection = { socket, sessionId: undefined, mode: undefined, closed: false }; connections.push(connection)
    socket.on('close', () => { connection.closed = true })
    socket.on('message', raw => {
      const message = JSON.parse(String(raw)); requests.push({ connection, method: message.method })
      const reply = result => socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
      if (message.method === 'initialize') {
        connection.sessionId = message.params.sessionId; connection.mode = page.url().endsWith('/baseline') ? 'baseline' : 'fixed'
        reply({ protocolVersion: 2, serverName: 'isolated fixture', serverVersion: 'test', agentCoreVersion: 'test', runtimeOrigin: 'local', capabilities: [] })
      } else if (message.method === 'event.list') {
        if (failC && connection.sessionId.startsWith('3')) {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'fixture snapshot failure' } })); return
        }
        const complete = () => reply({ items: [], hasMore: false, nextCursor: null })
        if (holdRecovery && connection.sessionId.startsWith('1')) pending.push(complete)
        else complete()
      } else if (message.method === 'turn.start') reply({ sessionId: connection.sessionId, turnId: randomUUID(), inputId: randomUUID(), state: 'accepted' })
      else socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unexpected fixture RPC' } }))
    })
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  try {
    const origin = `http://127.0.0.1:${http.address().port}`
    const before = new Map()
    for (const file of ['src/lib/connection-feedback.ts', 'src/hooks/useSessionConnectionFeedback.ts']) {
      const source = execFileSync('git', ['show', `HEAD:web/${file}`], { cwd: path.join(agent, 'frontend'), encoding: 'utf8' })
      before.set(path.join(web, file), source)
      await writeFile(path.join(evidence, 'baseline-' + path.basename(file)), source)
    }
    for (const mode of ['baseline', 'fixed']) {
      await build({ absWorkingDir: web, entryPoints: ['tests/fixtures/connection-notice-renderer.tsx'], outfile: path.join(scratch, `${mode}.js`),
        bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
        define: { 'import.meta.env': JSON.stringify({ DEV: true, VITE_EDEN_AGENT_LOCAL_BASE_URL: origin, VITE_EDEN_AGENT_LOCAL_CAPABILITY_TOKEN: 'synthetic-fixture' }) },
        plugins: mode === 'baseline' ? [{ name: 'before-fix-source', setup(builder) {
          builder.onLoad({ filter: /(?:connection-feedback|useSessionConnectionFeedback)\.ts$/ }, args => {
            const contents = before.get(path.normalize(args.path)); return contents === undefined ? undefined : { contents, loader: 'ts', resolveDir: path.dirname(args.path) }
          })
        } }] : [] })
    }
    const main = path.join(scratch, 'main.cjs')
    await writeFile(main, `const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(scratch, 'profile'))});app.on('window-all-closed',()=>{});app.whenReady().then(()=>new BrowserWindow({show:false,width:960,height:540,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}}).loadURL('about:blank'));`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    application = await _electron.launch({ executablePath: path.join(agent, 'node_modules/electron/dist/electron.exe'), args: [main], env })
    page = await application.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message))
    const root = page.locator('main'), restored = page.getByRole('heading', { name: '连接已恢复', exact: true })
    const sessionConnections = mode => connections.filter(connection => connection.mode === mode)
    await page.goto(origin + '/baseline'); await restored.waitFor()
    assert.equal(sessionConnections('baseline').length, 1); assert.equal(sessionConnections('baseline')[0].closed, false)
    await page.screenshot({ path: path.join(evidence, 'baseline-false-recovery.png') })
    checks.push('before-fix-first-connect-notifies-despite-one-socket-and-no-disconnection')
    await page.goto(origin + '/fixed')
    await page.waitForFunction(() => Number(document.querySelector('main')?.getAttribute('data-reads')) >= 1)
    assert.equal(await root.getAttribute('data-phase'), 'idle'); assert.equal(await restored.count(), 0)
    for (let count = 1; count <= 3; count++) { await page.getByRole('button', { name: '发送测试消息' }).click(); await page.getByText(`已发送 ${count} 条测试消息`, { exact: true }).waitFor() }
    assert.equal(await restored.count(), 0); assert.equal(sessionConnections('fixed').length, 1); assert.equal(sessionConnections('fixed')[0].closed, false)
    await page.screenshot({ path: path.join(evidence, 'fixed-normal-messages.png') })
    checks.push('fixed-initial-connection-and-three-turn-submissions-stay-silent-on-one-live-socket')
    await page.getByRole('button', { name: '会话 B', exact: true }).click()
    await page.waitForFunction(() => Number(document.querySelector('main')?.getAttribute('data-reads')) >= 2)
    assert.equal(await restored.count(), 0)
    await page.getByRole('button', { name: '会话 A', exact: true }).click()
    assert.equal(await restored.count(), 0); assert.equal(sessionConnections('fixed').length, 2)
    checks.push('opening-another-session-and-switching-back-do-not-claim-recovery')
    holdRecovery = true; sessionConnections('fixed').find(connection => connection.sessionId.startsWith('1')).socket.terminate()
    await page.getByRole('heading', { name: '此会话连接中断，正在重连', exact: true }).waitFor()
    await page.getByRole('heading', { name: '连接已建立，正在同步', exact: true }).waitFor()
    assert.equal(await restored.count(), 0)
    await page.screenshot({ path: path.join(evidence, 'fixed-real-recovery-syncing.png') })
    holdRecovery = false; for (const complete of pending.splice(0)) complete()
    await restored.waitFor()
    await page.screenshot({ path: path.join(evidence, 'fixed-real-recovery-complete.png') })
    checks.push('real-socket-failure-notifies-only-after-the-recovery-snapshot-completes')
    failC = true; await page.getByRole('button', { name: '会话 C', exact: true }).click()
    await page.getByRole('button', { name: '重新同步', exact: true }).waitFor(); assert.equal(await restored.count(), 0)
    failC = false; await page.getByRole('button', { name: '重新同步', exact: true }).click(); await restored.waitFor()
    checks.push('first-snapshot-failure-remains-actionable-and-explicit-retry-still-works')
    assert.equal(requests.filter(request => request.method === 'turn.start').length, 3); assert.deepEqual(errors, [])
    const result = { passed: true, verifiedAt: new Date().toISOString(), checks, errors, turnSubmissions: 3, baselineFalseNoticeWithoutDisconnection: true,
      transport: 'real loopback WebSocket, production channel pool, React hook and notice; isolated RPC fixture, no model calls or user database' }
    await writeFile(path.join(evidence, 'renderer-result.json'), JSON.stringify(result, null, 2)); t.diagnostic(JSON.stringify(result))
  } finally {
    await application?.close(); for (const client of ws.clients) client.terminate(); await new Promise(resolve => ws.close(resolve))
    http.closeAllConnections(); await new Promise(resolve => http.close(resolve))
    assert.equal(path.dirname(path.resolve(scratch)), path.resolve(tmpdir())); assert.ok(path.basename(scratch).startsWith('eden-connection-notice-'))
    await rm(scratch, { recursive: true, force: true })
  }
})
