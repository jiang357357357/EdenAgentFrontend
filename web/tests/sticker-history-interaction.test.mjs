import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('a real Electron renderer restores and loads the sticker from an independently reopened SQLite history page', {
  timeout: 60000, skip: !process.env.EDEN_STICKER_HISTORY_EVIDENCE || process.platform !== 'win32',
}, async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url)), evidence = process.env.EDEN_STICKER_HISTORY_EVIDENCE
  const page = JSON.parse(await readFile(path.join(evidence, 'restored-page.json'), 'utf8'))
  const root = await mkdtemp(path.join(tmpdir(), 'eden-sticker-renderer-'))
  try {
    const electron = createRequire(new URL('../../desktop/package.json', import.meta.url))('electron')
    await build({ absWorkingDir: webRoot, entryPoints: ['tests/fixtures/sticker-history-interaction.tsx'], outfile: path.join(root, 'renderer.js'),
      bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } })
    const builtRoot = process.env.EDEN_STICKER_HISTORY_WEB_DIST ?? path.join(webRoot, 'dist')
    const built = await readFile(path.join(builtRoot, 'index.html'), 'utf8')
    const css = /href="(?:\.?\/)?(assets\/[^"<>]+\.css)"/.exec(built)?.[1]; assert.ok(css)
    await writeFile(path.join(root, 'index.html'), `<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(builtRoot, css)).href}"><body class="bg-bg text-text"><script type="module" src="renderer.js"></script></body></html>`)
    const expression = `window.runStickerHistoryTests(${JSON.stringify(page)})`
    await writeFile(path.join(root, 'main.cjs'), `
const { app, BrowserWindow } = require('electron');
const { writeFile } = require('node:fs/promises');
app.setPath('userData', ${JSON.stringify(path.join(root, 'user-data'))});
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { backgroundThrottling: false } });
  try {
    await window.loadFile(${JSON.stringify(path.join(root, 'index.html'))});
    const result = await window.webContents.executeJavaScript(${JSON.stringify(expression)});
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve,160))))');
    await writeFile(${JSON.stringify(path.join(evidence, 'reopened.png'))}, (await window.webContents.capturePage()).toPNG());
    await writeFile(${JSON.stringify(path.join(evidence, 'renderer.json'))}, JSON.stringify(result,null,2));
    process.stdout.write('EDEN_STICKER=' + JSON.stringify(result) + '\\n');
  } catch(error) { process.stderr.write(String(error.stack || error)); process.exitCode=1; }
  finally { window.destroy(); app.quit(); }
});`)
    const result = await new Promise((resolve, reject) => {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
      const child = spawn(electron, [path.join(root, 'main.cjs')], { env, windowsHide: true, stdio: ['ignore','pipe','pipe'] })
      let output = '', errors = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error('Sticker renderer timed out')) }, 45000)
      child.stdout.on('data', bytes => { output += bytes }); child.stderr.on('data', bytes => { errors += bytes })
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => {
        clearTimeout(timer)
        const line = output.split(/\r?\n/).find(line => line.startsWith('EDEN_STICKER='))
        if (code !== 0 || !line) reject(new Error(`Sticker renderer failed (${code}): ${errors.slice(-4000)}`))
        else resolve(JSON.parse(line.slice('EDEN_STICKER='.length)))
      })
    })
    assert.equal(result.restored, true); assert.equal(result.imageLoaded, true)
    assert.equal(result.sameImage, true); assert.equal(result.duplicateImages, false); assert.equal(result.sharedFooter, true)
  } finally { assert.equal(path.dirname(root), path.resolve(tmpdir())); await rm(root, { recursive: true, force: true }) }
})
