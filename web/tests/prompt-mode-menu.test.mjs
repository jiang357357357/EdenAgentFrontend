import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

test('chat menu prompt mode persists independently and synchronizes settings without crossing accounts or worlds', {
  timeout: 60_000, skip: process.platform !== 'win32',
}, async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url)), scratch = await mkdtemp(join(tmpdir(), 'eden-prompt-mode-menu-'))
  try {
    const electron = createRequire(new URL('../../desktop/package.json', import.meta.url))('electron')
    const transport = join(webRoot, 'tests/fixtures/prompt-mode-menu-transport.ts')
    await build({ absWorkingDir: webRoot, entryPoints: ['tests/fixtures/prompt-mode-menu.tsx'],
      outfile: join(scratch, 'renderer.js'), bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
      plugins: [{ name: 'isolated-prompt-mode-rpc', setup(builder) {
        builder.onResolve({ filter: /rpc-transport$/ }, args => args.importer === transport ? undefined : { path: transport })
      } }] })
    await writeFile(join(scratch, 'index.html'), '<!doctype html><html><meta charset="utf-8"><body><script src="renderer.js"></script></body></html>')
    await writeFile(join(scratch, 'main.cjs'), `
const { app, BrowserWindow } = require('electron');
app.setPath('userData', ${JSON.stringify(join(scratch, 'user-data'))});
app.setPath('sessionData', ${JSON.stringify(join(scratch, 'session-data'))});
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  try {
    await window.loadFile(${JSON.stringify(join(scratch, 'index.html'))});
    const result = await window.webContents.executeJavaScript('window.runPromptModeMenuTests()');
    process.stdout.write('EDEN_PROMPT_MODE_RESULT=' + JSON.stringify(result) + '\\n');
  } catch (error) { process.stderr.write(String(error.stack || error)); process.exitCode = 1; }
  finally { window.destroy(); app.quit(); }
});`)
    const result = await new Promise((fulfill, reject) => {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
      const child = spawn(electron, [join(scratch, 'main.cjs')], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = '', errors = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error('Prompt mode menu renderer timed out')) }, 45_000)
      child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { errors += chunk })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('exit', code => {
        clearTimeout(timer)
        const line = output.split(/\r?\n/).find(value => value.startsWith('EDEN_PROMPT_MODE_RESULT='))
        if (code !== 0 || !line) reject(new Error(`Prompt mode renderer failed (${code}): ${errors.slice(-3000)}`))
        else fulfill(JSON.parse(line.slice('EDEN_PROMPT_MODE_RESULT='.length)))
      })
    })
    assert.deepEqual(result.checks, ['menu-entry-and-existing-controls', 'confirmed-save-no-optimism',
      'pending-toggle-deduplicated', 'menu-to-settings-sync', 'settings-to-menu-sync', 'permission-mode-independent',
      'save-failure-and-retry', 'stale-save-conflict', 'reopen-persistence', 'delayed-world-read-isolated',
      'delayed-world-write-isolated', 'account-isolation'])
    assert.equal(result.writes, 7)
  } finally {
    if (dirname(resolve(scratch)) !== resolve(tmpdir())) throw new Error('Unexpected prompt mode renderer cleanup path')
    await rm(scratch, { recursive: true, force: true })
  }
})
