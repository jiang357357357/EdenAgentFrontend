import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { _electron } from 'playwright-core'

test('Electron SSH form switches authentication by mouse and keyboard and submits only the selected credentials', {
  timeout: 60000, skip: process.platform !== 'win32',
}, async () => {
  const web = fileURLToPath(new URL('../', import.meta.url)), agent = path.resolve(web, '../..')
  const scratch = await mkdtemp(path.join(tmpdir(), 'eden-shared-host-ui-'))
  const evidence = path.resolve(agent, '../.release/current/Agent/shared-host')
  const errors = []
  let application
  const server = createServer(async (request, response) => {
    if (request.url === '/fixture.js') { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(path.join(scratch, 'fixture.js'))); return }
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.end('<html><meta charset="utf-8"><style>body{font:16px sans-serif;padding:24px;background:#f6f4ef}label{display:block;margin:10px 0}input,textarea{display:block;padding:6px}button{padding:8px;margin:4px}button[aria-pressed=true]{background:#d9e6df}fieldset{margin:12px 0}</style><body><div id="root"></div><script src="/fixture.js"></script></body></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    await build({ absWorkingDir: web, entryPoints: ['tests/fixtures/shared-host-form-renderer.tsx'], outfile: path.join(scratch, 'fixture.js'),
      bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent', define: { 'import.meta.env': '{}' } })
    const main = path.join(scratch, 'main.cjs')
    await writeFile(main, `const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(scratch, 'profile'))});app.on('window-all-closed',()=>{});app.whenReady().then(()=>new BrowserWindow({show:false,width:1100,height:1000,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}}).loadURL('about:blank'));`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    application = await _electron.launch({ executablePath: path.join(agent, 'node_modules/electron/dist/electron.exe'), args: [main], env })
    const page = await application.firstWindow(); page.setDefaultTimeout(10000)
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const password = page.getByRole('button', { name: '密码', exact: true }), key = page.getByRole('button', { name: '私钥', exact: true })
    const secret = page.getByLabel('SSH 私钥内容', { exact: true }), submit = page.locator('form button[type="submit"]')
    await key.click(); await secret.waitFor()
    assert.equal(await key.getAttribute('aria-pressed'), 'true')
    await secret.fill('discarded-secret')
    await password.focus(); await password.press('Space')
    await page.getByLabel('SSH 密码', { exact: true }).waitFor()
    await key.focus(); await key.press('Enter'); await secret.waitFor()
    assert.equal(await secret.inputValue(), '', 'Switching authentication clears hidden credentials')
    await page.getByLabel('SSH IP 或域名').fill('127.0.0.1')
    await page.getByLabel('SSH 用户名').fill('ubuntu')
    await page.getByRole('button', { name: '读取 SSH 主机指纹' }).click()
    assert.equal(await key.isDisabled(), true)
    assert.equal(await submit.isDisabled(), true)
    await page.evaluate(() => window.sharedHostFixture.releaseProbe())
    await page.getByText('SHA256:synthetic-fixture', { exact: true }).waitFor()
    await page.getByRole('checkbox', { name: /已与云服务器控制台/ }).check()
    const credentials = { type: 'key', privateKey: 'synthetic-private-key', passphrase: 'synthetic-passphrase' }
    await secret.fill(credentials.privateKey); await page.getByLabel('私钥口令', { exact: true }).fill(credentials.passphrase)
    await submit.click(); await page.getByRole('alert').filter({ hasText: '测试连接失败' }).waitFor()
    assert.deepEqual(await page.evaluate(() => window.sharedHostFixture.requests[0].auth), credentials)
    assert.equal(await secret.inputValue(), '')
    assert.equal(await page.getByLabel('私钥口令', { exact: true }).inputValue(), '')
    assert.equal(await submit.isDisabled(), true)
    await secret.fill('retry-private-key'); await submit.click()
    await page.waitForFunction(() => window.sharedHostFixture.requests.length === 2)
    assert.deepEqual(await page.evaluate(() => window.sharedHostFixture.requests[1].auth), { type: 'key', privateKey: 'retry-private-key' })
    assert.equal(await page.getByRole('alert').count(), 0)
    await password.click(); await page.getByLabel('SSH 密码', { exact: true }).fill('synthetic-password'); await submit.click()
    await page.waitForFunction(() => window.sharedHostFixture.requests.length === 3)
    assert.deepEqual(await page.evaluate(() => window.sharedHostFixture.requests[2].auth), { type: 'password', password: 'synthetic-password' })
    assert.deepEqual(errors, [])
    await mkdir(evidence, { recursive: true })
    await page.screenshot({ path: path.join(evidence, 'authentication-form.png'), fullPage: true })
    await writeFile(path.join(evidence, 'form-result.json'), JSON.stringify({ passed: true, mouseAndKeyboard: true, authModes: ['key', 'key', 'password'], secretsCleared: true, errors }, null, 2))
  } finally {
    await application?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    await rm(scratch, { recursive: true, force: true })
  }
})
