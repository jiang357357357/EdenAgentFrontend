import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('actual Electron question forms distinguish counts, keep navigation visible and submit each independent answer', { timeout: 60000, skip: process.platform !== 'win32' }, async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url)), root = resolve(webRoot, '../..')
  const scratch = await mkdtemp(join(tmpdir(), 'eden-question-form-'))
  const evidence = join(root, '../.release/current/Agent/question-repair')
  try {
    await build({ absWorkingDir: webRoot, entryPoints: ['tests/fixtures/question-form-preview.tsx'], outfile: join(scratch, 'renderer.js'),
      bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } })
    const dist = process.env.EDEN_AGENT_WEB_TEST_DIST ?? join(webRoot, 'dist')
    const built = await readFile(join(dist, 'index.html'), 'utf8')
    const css = /href="(?:\.?\/)?(assets\/[^"<>]+\.css)"/.exec(built)?.[1]
    assert.ok(css, 'build the frontend before renderer acceptance')
    await writeFile(join(scratch, 'index.html'), `<!doctype html><html data-base-theme="cream"><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(join(dist, css)).href}"><body class="bg-bg text-text"><div id="root"></div><script src="renderer.js"></script></body></html>`)
    const electron = createRequire(new URL('../../desktop/package.json', import.meta.url))('electron')
    const result = await new Promise((fulfill, reject) => {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
      const child = spawn(electron, [join(webRoot, '../desktop/tests/fixtures/question-form-main.cjs'), scratch, evidence], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error(`Question form timed out: ${stderr.slice(-2000)}`)) }, 45000)
      child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('exit', code => {
        clearTimeout(timer)
        const line = stdout.split(/\r?\n/).find(value => value.startsWith('QUESTION_FORM_RESULT='))
        if (code !== 0 || !line) reject(new Error(`Question form failed (${code}): ${stderr.slice(-4000)}`))
        else fulfill(JSON.parse(line.slice('QUESTION_FORM_RESULT='.length)))
      })
    })
    assert.equal(result.passed, true)
    assert.deepEqual(result.counts, [1, 2, 3])
    assert.equal(result.fixedHeaderAndFooter, true)
    assert.equal(result.failureRetryPreservesDraft, true)
    assert.equal(result.nativeInputPerformed, false)
  } finally {
    assert.equal(dirname(resolve(scratch)), resolve(tmpdir()))
    assert.ok(scratch.startsWith(join(resolve(tmpdir()), 'eden-question-form-')))
    await rm(scratch, { recursive: true, force: true })
  }
})
