import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('hidden Electron verifies primary wakeup, auxiliary sync retry and an answerable primary fallback over IPC', { timeout: 60000, skip: process.platform !== 'win32' }, async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url)), root = resolve(webRoot, '../..')
  const scratch = await mkdtemp(join(tmpdir(), 'eden-question-window-'))
  const evidence = join(root, '../.release/current/Agent/question-repair')
  try {
    await build({ absWorkingDir: webRoot, entryPoints: ['tests/fixtures/question-window-renderer.tsx'], outfile: join(scratch, 'renderer.js'),
      bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"', 'import.meta': '{}' }, logOverride: { 'import-is-undefined': 'silent' } })
    const built = await readFile(join(webRoot, 'dist/index.html'), 'utf8')
    const css = /href="(?:\.?\/)?(assets\/[^"<>]+\.css)"/.exec(built)?.[1]
    assert.ok(css, 'build the frontend before renderer acceptance')
    await writeFile(join(scratch, 'index.html'), `<!doctype html><html data-base-theme="cream"><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(join(webRoot, 'dist', css)).href}"><body class="bg-bg text-text"><div id="root"></div><script src="renderer.js"></script></body></html>`)
    await writeFile(join(scratch, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('edenAgentDesktop',{invoke:(command,args)=>ipcRenderer.invoke('eden-agent:invoke',command,args),rendererReady:()=>ipcRenderer.send('eden-agent:renderer-ready')});
contextBridge.exposeInMainWorld('questionFixture',{request:(command,args)=>ipcRenderer.invoke('question-fixture',command,args),
onAnswered:callback=>{const fn=(_event,id)=>callback(id);ipcRenderer.on('fixture-answered',fn);return()=>ipcRenderer.removeListener('fixture-answered',fn)}});`)
    const electron = createRequire(new URL('../../desktop/package.json', import.meta.url))('electron')
    const result = await new Promise((fulfill, reject) => {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
      const child = spawn(electron, [join(webRoot, '../desktop/tests/fixtures/question-window-main.cjs'), scratch, evidence], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error(`Question renderer timed out: ${stderr.slice(-2000)}`)) }, 45000)
      child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('exit', code => {
        clearTimeout(timer)
        const line = stdout.split(/\r?\n/).find(value => value.startsWith('QUESTION_WINDOW_RESULT='))
        if (code !== 0 || !line) reject(new Error(`Question renderer failed (${code}): ${stderr.slice(-3000)}`))
        else fulfill(JSON.parse(line.slice('QUESTION_WINDOW_RESULT='.length)))
      })
    })
    assert.equal(result.passed, true)
    assert.equal(result.hiddenNativeWindows, true)
    assert.equal(result.fallbackAnswerAfterNativeHide, true)
    assert.equal(result.nativeInputPerformed, false)
  } finally {
    assert.equal(dirname(resolve(scratch)), resolve(tmpdir()))
    assert.ok(scratch.startsWith(join(resolve(tmpdir()), 'eden-question-window-')))
    await rm(scratch, { recursive: true, force: true })
  }
})
