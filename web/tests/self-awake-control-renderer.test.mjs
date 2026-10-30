import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

test('actual Electron renders retry diagnostics, confirmed pause, uncertain updates and account isolation', { timeout: 60000 }, async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url))
  const scratch = await mkdtemp(join(tmpdir(), 'eden-awake-control-'))
  try {
    await build({ absWorkingDir: webRoot, entryPoints: ['tests/fixtures/self-awake-control-renderer.tsx'],
      outfile: join(scratch, 'renderer.js'), bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"' },
      plugins: [{ name: 'isolated-control-host', setup(builder) {
        builder.onResolve({ filter: /\/lib\/(rpc-transport|runtime-origin|auth)$/ }, args => {
          if (args.importer.endsWith('use-self-awake-control.ts')) return { path: args.path.split('/').at(-1), namespace: 'wake-fixture' }
        })
        builder.onLoad({ filter: /.*/, namespace: 'wake-fixture' }, args => ({ contents: args.path === 'rpc-transport' ? `
          export async function rpcRequest(method,input){const f=window.wakeFixture;f.calls.push({method,input});
            if(method==='self_awake.control.update'){if(f.failUpdate)throw Error('fixture response lost');
              f.control={...f.control,enabled:input.enabled,updatedAt:8,schedule:{status:'disabled',nextWakeAt:null,reason:'paused'}};}
            return structuredClone(f.control);}` : args.path === 'runtime-origin'
          ? 'export const getRuntimeOriginRevision=()=>window.wakeFixture.revision;'
          : "export const getErrorMessage=(error,fallback)=>error?.message||fallback;" }))
      } }] })
    await writeFile(join(scratch, 'index.html'), '<!doctype html><html><meta charset="utf-8"><body><script src="renderer.js"></script></body></html>')
    await writeFile(join(scratch, 'main.cjs'), `
const {app,BrowserWindow}=require('electron');
app.disableHardwareAcceleration();app.setPath('userData',${JSON.stringify(join(scratch, 'user-data'))});
app.setPath('sessionData',${JSON.stringify(join(scratch, 'session-data'))});
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
 try{await win.loadFile(${JSON.stringify(join(scratch, 'index.html'))});
 const result=await win.webContents.executeJavaScript('window.runWakeControlTests().catch(error=>({error:String(error.stack||error)}))');
 process.stdout.write('WAKE_CONTROL_RESULT='+JSON.stringify(result)+'\\n');}
 catch(error){process.stderr.write(String(error.stack||error));process.exitCode=1;}finally{win.destroy();app.quit();}});`)
    const electron = createRequire(new URL('../../desktop/package.json', import.meta.url))('electron')
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    const result = await new Promise((fulfill, reject) => {
      const child = spawn(electron, [join(scratch, 'main.cjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error('control renderer timed out')) }, 45000)
      child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('exit', code => {
        clearTimeout(timer)
        const line = stdout.split(/\r?\n/).find(line => line.startsWith('WAKE_CONTROL_RESULT='))
        if (code !== 0 || !line) reject(new Error(`renderer failed (${code}): ${stderr.slice(-2500)}`))
        else fulfill(JSON.parse(line.slice('WAKE_CONTROL_RESULT='.length)))
      })
    })
    assert.equal(result.error, undefined, result.error)
    assert.deepEqual(result, { retryVisible: true, pauseConfirmed: true, mutationUncertaintyVisible: true, accountScopeReloaded: true })
  } finally {
    if (dirname(resolve(scratch)) !== resolve(tmpdir()) || !scratch.startsWith(join(resolve(tmpdir()), 'eden-awake-control-'))) throw new Error('Unexpected cleanup path')
    await rm(scratch, { recursive: true, force: true })
  }
})
