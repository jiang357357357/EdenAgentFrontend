import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { build } from 'esbuild'

const tests = path.dirname(fileURLToPath(import.meta.url)), fixtures = path.join(tests, 'fixtures')
const hook = path.resolve(tests, '../src/hooks/useTTSSpeech.ts')
const electron = path.join(path.dirname(createRequire(import.meta.url).resolve('electron')), 'dist/electron.exe')

test('pausing a previous answer cannot block the next streamed answer or erase its chunk cursor', { timeout: 20000 }, async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'eden-speech-paused-')))
  try {
    await build({ entryPoints: [path.join(fixtures, 'speech-paused-preview.jsx')], outfile: path.join(directory, 'fixture.js'),
      bundle: true, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [{ name: 'isolated-speech-pause-host', setup(builder) {
        builder.onResolve({ filter: /^(\.\.\/lib\/)(rpc-transport|agent-client|desktop-window)$/ }, args => {
          if (path.resolve(args.importer) === hook) return { path: path.join(fixtures, 'speech-paused-host.js') }
        })
      } }] })
    await writeFile(path.join(directory, 'index.html'), '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="fixture.js"></script>')
    const env = { ...process.env, EDEN_SPEECH_FIXTURE_DIRECTORY: directory }; delete env.ELECTRON_RUN_AS_NODE
    const code = await new Promise((resolve, reject) => {
      const child = spawn(electron, [path.join(fixtures, 'speech-disabled-electron.cjs')], { env, windowsHide: true, stdio: 'ignore' })
      const timer = setTimeout(() => { child.kill(); reject(new Error('Speech pause fixture timed out')) }, 12000)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); resolve(code) })
    })
    const result = JSON.parse(await readFile(path.join(directory, 'result.json'), 'utf8'))
    assert.equal(result.error, undefined, result.error); assert.equal(code, 0)
    assert.equal(result.initial.active, 'old-segment', JSON.stringify(result))
    assert.equal(result.sameTurnPaused, true); assert.equal(result.stillPaused, true); assert.equal(result.sameTurnResumed, true)
    assert.equal(result.beforeCompletion.calls.length, 1, JSON.stringify(result.beforeCompletion))
    assert.equal(result.beforeCompletion.active, 'next-segment', JSON.stringify(result.beforeCompletion))
    assert.equal(result.beforeCompletion.played.length, 1, JSON.stringify(result.beforeCompletion))
    assert.deepEqual(result.afterAppend, ['下一条消息的第一句。', '正在继续生成第二句。'])
    assert.equal(result.nextReservations, 1)
    assert.deepEqual(result.bufferedInitially, { active: 'buffered-segment', paused: false })
    assert.equal(result.bufferedAcrossRun.length, 1)
    assert.equal(result.bufferedRunInterrupts, 1)
  } finally {
    assert.equal(path.dirname(directory), await realpath(tmpdir()))
    assert.ok(path.basename(directory).startsWith('eden-speech-paused-'))
    await rm(directory, { recursive: true, force: true })
  }
})
