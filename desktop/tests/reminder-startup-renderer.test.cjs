const assert = require('node:assert/strict')
const test = require('node:test')
const { build } = require('esbuild')
const { spawn } = require('node:child_process')
const { mkdtemp, mkdir, copyFile, writeFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')

function runRenderer(scratch, mode) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/reminder-startup-main.cjs'), scratch, mode], {
      windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = '', errors = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Startup renderer timed out: ${errors.slice(-2000)}`)) }, 30_000)
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { errors += chunk })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => {
      clearTimeout(timer)
      const line = output.split(/\r?\n/).find(value => value.startsWith('EDEN_STARTUP_RESULT='))
      if (code !== 0 || !line) reject(new Error(`Startup renderer failed (${code}): ${errors.slice(-3000)}`))
      else resolve(JSON.parse(line.slice('EDEN_STARTUP_RESULT='.length)))
    })
  })
}

test('real React/preload startup gates reminders, and reminder crashes or closes preserve the primary DOM', {
  timeout: 75_000, skip: process.platform !== 'win32' ? 'Windows Electron acceptance' : false,
}, async () => {
  const evidence = path.resolve(__dirname, '../../../.artifacts/reminder-startup-20261014')
  await mkdir(evidence, { recursive: true })
  for (const mode of ['baseline', 'fixed']) {
    const scratch = await mkdtemp(path.join(tmpdir(), 'eden-reminder-startup-'))
    try {
      await build({ absWorkingDir: path.resolve(__dirname, '../../web'),
        entryPoints: ['tests/fixtures/desktop-startup-renderer.tsx'], outfile: path.join(scratch, 'renderer.js'),
        bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"development"' },
      })
      const result = await runRenderer(scratch, mode)
      assert.equal(result.premature, mode === 'baseline')
      assert.equal(result.afterClose.children, 1)
      assert.equal(result.afterClose.text, '主界面已完成首次绘制')
      await writeFile(path.join(evidence, `${mode}.json`), JSON.stringify(result, null, 2) + '\n')
      for (const file of ['primary.png', 'reminder.png']) await copyFile(path.join(scratch, file), path.join(evidence, `${mode}-${file}`))
    } finally {
      if (path.dirname(path.resolve(scratch)) !== path.resolve(tmpdir())) throw new Error('Unexpected startup cleanup path')
      await rm(scratch, { recursive: true, force: true })
    }
  }
})
