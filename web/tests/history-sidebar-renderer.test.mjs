import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('isolated Electron verifies history maintenance races and virtual sidebar interactions', {
  timeout: 60000, skip: process.platform !== 'win32' ? 'Windows renderer acceptance' : false,
}, async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url)), agentRoot = resolve(webRoot, '../..')
  const scratch = await mkdtemp(join(tmpdir(), 'eden-history-sidebar-'))
  try {
    const electron = createRequire(new URL('../../desktop/package.json', import.meta.url))('electron')
    await build({ absWorkingDir: webRoot, entryPoints: ['tests/fixtures/history-sidebar-renderer.tsx'],
      outfile: join(scratch, 'renderer.js'), bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"', 'import.meta': '{}' },
      plugins: [{ name: 'history-host', setup(builder) {
        builder.onResolve({ filter: /\/lib\/agent-client$/ }, args => {
          if (args.importer.endsWith('useSessionHistoryMaintenance.ts')) return { path: join(webRoot, 'tests/fixtures/history-maintenance-host.ts') }
        })
      } }], logOverride: { 'import-is-undefined': 'silent' } })
    const built = await readFile(join(webRoot, 'dist/index.html'), 'utf8')
    const css = /href="(?:\.?\/)?(assets\/[^"<>]+\.css)"/.exec(built)?.[1]
    assert.ok(css, 'build frontend before styled acceptance')
    await writeFile(join(scratch, 'index.html'), `<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(join(webRoot, 'dist', css)).href}"><body class="bg-bg text-text"><script src="renderer.js"></script></body></html>`)
    const evidence = join(agentRoot, '.artifacts/history-sidebar-20261012')
    await mkdir(evidence, { recursive: true })
    await writeFile(join(scratch, 'main.cjs'), `
const { app, BrowserWindow } = require('electron');
const {writeFile}=require('node:fs/promises');
app.setPath('userData',${JSON.stringify(join(scratch,'user-data'))});
app.setPath('sessionData',${JSON.stringify(join(scratch,'user-data'))});
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{backgroundThrottling:false}});
 try{await window.loadFile(${JSON.stringify(join(scratch,'index.html'))});
 const result=await window.webContents.executeJavaScript('(async()=>{try{return await window.runHistorySidebarTests()}catch(error){return {error:String(error.stack||error)}}})()');
 await writeFile(${JSON.stringify(join(evidence,'sidebar.png'))},(await window.webContents.capturePage()).toPNG());
 process.stdout.write('HISTORY_RESULT='+JSON.stringify(result)+'\\n');}
 catch(error){process.stderr.write(String(error.stack||error));process.exitCode=1;}
 finally{window.destroy();app.quit();}
});`)
    const result = await new Promise((fulfill, reject) => {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
      const child = spawn(electron, [join(scratch, 'main.cjs')], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      const timeout = setTimeout(() => { child.kill(); reject(new Error('history fixture timed out')) }, 45000)
      child.stdout.on('data', chunk => { stdout += chunk }); child.stderr.on('data', chunk => { stderr += chunk })
      child.on('error', error => { clearTimeout(timeout); reject(error) })
      child.on('exit', code => {
        clearTimeout(timeout)
        const line = stdout.split(/\r?\n/).find(item => item.startsWith('HISTORY_RESULT='))
        if (code !== 0 || !line) reject(new Error(`renderer failed (${code}): ${stderr.slice(-3000)}`))
        else fulfill(JSON.parse(line.slice('HISTORY_RESULT='.length)))
      })
    })
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.restoredRecentPage, true)
    assert.equal(result.browsingAndLateResponsesSafe, true)
    assert.equal(result.oversizedPageSettles, true)
    assert.equal(result.staleContentAndReselectionSafe, true)
    assert.ok(result.sidebar.mountedSessions < 30)
    assert.ok(result.sidebar.domElements < 600)
    assert.deepEqual(result.sidebarActions, { scroll: true, keyboard: true, select: true, delete: true, rename: true, filter: true })
    await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  } finally {
    if (dirname(resolve(scratch)) !== resolve(tmpdir()) || !scratch.startsWith(join(resolve(tmpdir()), 'eden-history-sidebar-'))) throw new Error('Unexpected cleanup path')
    await rm(scratch, { recursive: true, force: true })
  }
})
