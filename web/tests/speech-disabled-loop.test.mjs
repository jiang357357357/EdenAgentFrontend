import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const tests = path.dirname(fileURLToPath(import.meta.url))
const hook = path.resolve(tests, '../src/hooks/useTTSSpeech.ts')
const fixtures = path.join(tests, 'fixtures')
let candidate = process.env.EDEN_TEST_ELECTRON
if (!candidate) {
  try {
    const electronDirectory = path.dirname(createRequire(import.meta.url).resolve('electron'))
    const executable = (await readFile(path.join(electronDirectory, 'path.txt'), 'utf8')).trim()
    candidate = path.join(electronDirectory, 'dist', executable)
  } catch {}
}
const available = Boolean(candidate) && await access(candidate).then(() => true, () => false)

test('disabled TTS settles with fresh segment arrays and only stops on mode transitions', { skip: !available, timeout: 20000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'eden-speech-disabled-'))
  try {
    await build({
      entryPoints: [path.join(fixtures, 'speech-disabled-preview.jsx')],
      outfile: path.join(directory, 'fixture.js'), bundle: true, platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [{ name: 'isolated-speech-host', setup(builder) {
        builder.onResolve({ filter: /^(\.\.\/lib\/)(rpc-transport|agent-client|desktop-window)$/ }, args => {
          if (path.resolve(args.importer) === hook) return { path: path.join(fixtures, 'speech-disabled-host.js') }
        })
        if (process.env.EDEN_SPEECH_BASELINE_SOURCE) builder.onLoad({ filter: /useTTSSpeech\.ts$/ }, async () => ({
          contents: await readFile(process.env.EDEN_SPEECH_BASELINE_SOURCE, 'utf8'), loader: 'ts', resolveDir: path.dirname(hook),
        }))
      } }],
    })
    await writeFile(path.join(directory, 'index.html'), '<div id="root"></div><script src="fixture.js"></script>')
    const environment = { ...process.env, EDEN_SPEECH_FIXTURE_DIRECTORY: directory }
    delete environment.ELECTRON_RUN_AS_NODE
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(candidate, [path.join(fixtures, 'speech-disabled-electron.cjs')], { env: environment, windowsHide: true, stdio: 'ignore' })
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Electron fixture timed out')) }, 12000)
      child.on('error', error => { clearTimeout(timeout); reject(error) })
      child.on('exit', code => { clearTimeout(timeout); resolve(code) })
    })
    const result = JSON.parse(await readFile(path.join(directory, 'result.json'), 'utf8'))
    assert.equal(result.error, undefined, result.error)
    assert.equal(exitCode, 0)
    assert.equal(result.initial.disabledStops, 1)
    assert.ok(result.initial.renders <= 4, `Initial render count: ${result.initial.renders}`)
    assert.equal(result.rerendered.disabledStops, 1)
    assert.ok(result.rerendered.renders <= 18, `Repeated render count: ${result.rerendered.renders}`)
    assert.equal(result.final.disabledStops, 2)
    assert.ok(result.final.renders <= 30, `Final render count: ${result.final.renders}`)
    assert.equal(result.rpcCalls, 0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
