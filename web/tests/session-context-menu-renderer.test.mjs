import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('isolated Electron verifies session context menu, archive failure/recovery, restore and deletion', {
  timeout: 60000, skip: process.platform !== 'win32' ? 'Windows renderer acceptance' : false,
}, async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url)), agentRoot = resolve(webRoot, '../..')
  const evidence = resolve(agentRoot, '../.release/session-archive-20261015')
  const scratch = await mkdtemp(join(tmpdir(), 'eden-session-menu-'))
  try {
    const electron = createRequire(new URL('../../desktop/package.json', import.meta.url))('electron')
    await build({ absWorkingDir: webRoot, entryPoints: ['tests/fixtures/session-context-menu-renderer.tsx'],
      outfile: join(scratch, 'renderer.js'), bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"', 'import.meta': '{}' },
      plugins: [{ name: 'archive-host', setup(builder) {
        builder.onResolve({ filter: /\/lib\/rpc-transport$/ }, args => {
          if (args.importer.endsWith('AllSessionsPage.tsx')) return { path: join(webRoot, 'tests/fixtures/session-context-menu-host.ts') }
        })
      } }], logOverride: { 'import-is-undefined': 'silent' } })
    const built = await readFile(join(webRoot, 'dist/index.html'), 'utf8')
    const css = /href="(?:\.?\/)?(assets\/[^"<>]+\.css)"/.exec(built)?.[1]
    assert.ok(css, 'run the isolated frontend build first')
    await writeFile(join(scratch, 'index.html'), `<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(join(webRoot, 'dist', css)).href}"><body class="bg-bg text-text"><script src="renderer.js"></script></body></html>`)
    await mkdir(evidence, { recursive: true })
    await writeFile(join(scratch, 'main.cjs'), `
const { app, BrowserWindow } = require('electron');
const {writeFile}=require('node:fs/promises');
app.disableHardwareAcceleration();
app.setPath('userData',${JSON.stringify(join(scratch, 'user-data'))});
app.setPath('sessionData',${JSON.stringify(join(scratch, 'user-data'))});
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{backgroundThrottling:false,offscreen:true}});
 try{await window.loadFile(${JSON.stringify(join(scratch, 'index.html'))});
 await window.webContents.executeJavaScript('window.prepareSessionMenu()');
 await new Promise(resolve=>setTimeout(resolve,150));
 await writeFile(${JSON.stringify(join(evidence, 'context-menu.png'))},(await window.webContents.capturePage()).toPNG());
 const result=await window.webContents.executeJavaScript('window.runSessionMenuTests().catch(error=>({error:String(error.stack||error)}))');
 process.stdout.write('SESSION_MENU_RESULT='+JSON.stringify(result)+'\\n');}
 catch(error){process.stderr.write(String(error.stack||error));process.exitCode=1;}
 finally{window.destroy();app.quit();}
});`)
    const result = await new Promise((fulfill, reject) => {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
      const child = spawn(electron, [join(scratch, 'main.cjs')], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error('session menu renderer timed out')) }, 45000)
      child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('exit', code => {
        clearTimeout(timer)
        const line = stdout.split(/\r?\n/).find(item => item.startsWith('SESSION_MENU_RESULT='))
        if (code !== 0 || !line) reject(new Error(`renderer failed (${code}): ${stderr.slice(-2500)}`))
        else fulfill(JSON.parse(line.slice('SESSION_MENU_RESULT='.length)))
      })
    })
    assert.equal(result.error, undefined, result.error)
    assert.equal(Object.keys(result).length, 6)
    assert.ok(Object.values(result).every(value => value === true))
    await writeFile(join(evidence, 'renderer-evidence.json'), JSON.stringify(result, null, 2))
  } finally {
    if (dirname(resolve(scratch)) !== resolve(tmpdir()) || !scratch.startsWith(join(resolve(tmpdir()), 'eden-session-menu-'))) throw new Error('Unexpected cleanup path')
    await rm(scratch, { recursive: true, force: true })
  }
})
