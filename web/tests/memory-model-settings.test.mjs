import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

test('Local model settings downloads only on click and supports progress, cancel, retry and world isolation', { timeout: 60000 }, async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url)), scratch = await mkdtemp(join(tmpdir(), 'eden-model-settings-'))
  try {
    const electron = createRequire(new URL('../../desktop/package.json', import.meta.url))('electron')
    await build({ absWorkingDir: webRoot, entryPoints: ['tests/fixtures/memory-model-settings.tsx'], outfile: join(scratch, 'renderer.js'),
      bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
      plugins: [{ name: 'model-rpc-fixture', setup(builder) {
        builder.onResolve({ filter: /rpc-transport$/ }, () => ({ path: join(webRoot, 'tests/fixtures/memory-model-transport.ts') }))
      } }] })
    await writeFile(join(scratch, 'index.html'), '<!doctype html><meta charset="utf-8"><body><script src="renderer.js"></script>')
    await writeFile(join(scratch, 'main.cjs'), `const{app,BrowserWindow}=require('electron');
app.setPath('userData',${JSON.stringify(join(scratch, 'user-data'))});app.setPath('sessionData',${JSON.stringify(join(scratch, 'session-data'))});
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
try{await w.loadFile(${JSON.stringify(join(scratch, 'index.html'))});const result=await w.webContents.executeJavaScript('window.runModelTests()');process.stdout.write('MODEL_RESULT='+JSON.stringify(result)+'\\n');}
catch(e){process.stderr.write(String(e.stack||e));process.exitCode=1;}finally{w.destroy();app.quit();}});`)
    const result = await new Promise((fulfill, reject) => {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
      const child = spawn(electron, [join(scratch, 'main.cjs')], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = '', errors = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error('Model renderer timeout')) }, 45000)
      child.stdout.on('data', value => { output += value }); child.stderr.on('data', value => { errors += value })
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => {
        clearTimeout(timer)
        const line = output.split(/\r?\n/).find(value => value.startsWith('MODEL_RESULT='))
        if (code !== 0 || !line) reject(new Error(errors.slice(-3000)))
        else fulfill(JSON.parse(line.slice('MODEL_RESULT='.length)))
      })
    })
    assert.deepEqual(result, { optIn: true, progress: true, cancel: true, retry: true, ready: true, worldIsolation: true })
  } finally {
    if (dirname(resolve(scratch)) !== resolve(tmpdir())) throw new Error('Unexpected model renderer cleanup path')
    await rm(scratch, { recursive: true, force: true })
  }
})
