import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { build } from 'esbuild'
const tests = path.dirname(fileURLToPath(import.meta.url)), fixtures = path.join(tests, 'fixtures'), hook = path.resolve(tests, '../src/hooks/useTTSSpeech.ts')
const electron = path.join(path.dirname(createRequire(import.meta.url).resolve('electron')), 'dist/electron.exe')
test('real React speech hook stops after four failures across repeated epochs, releases output gate and allows manual recovery', { timeout: 20000 }, async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'eden-speech-failures-')))
  try {
    await build({ entryPoints: [path.join(fixtures, 'speech-failure-preview.jsx')], outfile: path.join(root, 'fixture.js'), bundle: true, platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'isolated-speech-failure-host', setup(builder) {
        builder.onResolve({ filter: /^(\.\.\/lib\/)(rpc-transport|agent-client|desktop-window)$/ }, args => {
          if (path.resolve(args.importer) === hook) return { path: path.join(fixtures, 'speech-failure-host.js') }
        })
      } }] })
    await writeFile(path.join(root, 'index.html'), '<div id="root"></div><script src="fixture.js"></script>')
    const env = { ...process.env, EDEN_SPEECH_FIXTURE_DIRECTORY: root }; delete env.ELECTRON_RUN_AS_NODE
    const code = await new Promise((resolve, reject) => {
      const child = spawn(electron, [path.join(fixtures, 'speech-disabled-electron.cjs')], { env, windowsHide: true, stdio: 'ignore' })
      const timer = setTimeout(() => { child.kill(); reject(new Error('Speech failure fixture timed out')) }, 12000)
      child.once('error', error => { clearTimeout(timer); reject(error) }); child.once('exit', code => { clearTimeout(timer); resolve(code) })
    })
    const result = JSON.parse(await readFile(path.join(root, 'result.json'), 'utf8'))
    assert.equal(result.error, undefined, result.error); assert.equal(code, 0)
    assert.equal(result.beforeRewrite, 4); assert.equal(result.afterRewrite, 4)
    assert.equal(result.pendingAfterFailure, false, JSON.stringify(result)); assert.ok(result.manualCalls > 0); assert.equal(result.pendingAfterManual, false, JSON.stringify(result))
  } finally {
    assert.equal(path.dirname(root), await realpath(tmpdir())); assert.ok(path.basename(root).startsWith('eden-speech-failures-'))
    await rm(root, { recursive: true, force: true })
  }
})
