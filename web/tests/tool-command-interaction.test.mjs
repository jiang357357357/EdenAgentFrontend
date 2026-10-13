import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('isolated Electron expands real exec_command cards and preserves readable multiline results', {
  timeout: 60_000, skip: process.platform !== 'win32' ? 'Windows desktop renderer acceptance' : false,
}, async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url)), taskRoot = resolve(webRoot, '../..')
  const scratch = await mkdtemp(join(tmpdir(), 'eden-tool-command-'))
  try {
    const electron = createRequire(new URL('../../desktop/package.json', import.meta.url))('electron')
    await build({ absWorkingDir: webRoot, entryPoints: ['tests/fixtures/tool-command-interaction.tsx'],
      outfile: join(scratch, 'renderer.js'), bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"' } })
    const built = await readFile(join(webRoot, 'dist/index.html'), 'utf8')
    const css = /href="(?:\.?\/)?(assets\/[^"<>]+\.css)"/.exec(built)?.[1]
    assert.ok(css, 'Build the Web client before running the styled renderer fixture')
    await writeFile(join(scratch, 'index.html'), `<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(join(webRoot, 'dist', css)).href}"><body class="bg-bg text-text"><script src="renderer.js"></script></body></html>`)
    const evidence = join(taskRoot, 'dist/verification/tool-command-results.png')
    await mkdir(dirname(evidence), { recursive: true })
    await writeFile(join(scratch, 'main.cjs'), `
const { app, BrowserWindow } = require('electron');
const { writeFile } = require('node:fs/promises');
app.setPath('userData', ${JSON.stringify(join(scratch, 'user-data'))});
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1000, height: 900, webPreferences: { backgroundThrottling: false } });
  try {
    await window.loadFile(${JSON.stringify(join(scratch, 'index.html'))});
    const result = await window.webContents.executeJavaScript('window.runToolCommandTests()');
    await writeFile(${JSON.stringify(evidence)}, (await window.webContents.capturePage()).toPNG());
    process.stdout.write('EDEN_TOOL_RESULT=' + JSON.stringify(result) + '\\n');
  } catch (error) { process.stderr.write(String(error.stack || error)); process.exitCode = 1; }
  finally { window.destroy(); app.quit(); }
});`)
    const result = await new Promise((fulfill, reject) => {
      const environment = { ...process.env }
      delete environment.ELECTRON_RUN_AS_NODE; delete environment.NODE_OPTIONS
      const child = spawn(electron, [join(scratch, 'main.cjs')], { windowsHide: true, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = '', errors = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error('Tool card renderer timed out')) }, 45_000)
      child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { errors += chunk })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('exit', code => {
        clearTimeout(timer)
        const line = output.split(/\r?\n/).find(value => value.startsWith('EDEN_TOOL_RESULT='))
        if (code !== 0 || !line) reject(new Error(`Renderer failed (${code}): ${errors.slice(-4000)}`))
        else fulfill(JSON.parse(line.slice('EDEN_TOOL_RESULT='.length)))
      })
    })
    assert.deepEqual(result, { liveCompletion: true, separateMultilineStreams: true, commandEscapesPreserved: true,
      rawInspectable: true, failureVisible: true, emptyCleared: true, malformedFallback: true,
      longOutputScrollable: true, collapseWorks: true })
  } finally {
    if (dirname(resolve(scratch)) !== resolve(tmpdir())) throw new Error('Unexpected renderer cleanup path')
    await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
