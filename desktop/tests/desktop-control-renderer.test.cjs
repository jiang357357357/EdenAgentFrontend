const assert = require('node:assert/strict')
const test = require('node:test')
const { spawn } = require('node:child_process')
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')

test('independent desktop control renders and invokes its guarded IPC while all native windows remain hidden',
  { skip: process.platform !== 'win32', timeout: 45000 }, async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), 'eden-floating-control-'))
    const evidence = path.resolve(process.env.EDEN_DESKTOP_CONTROL_EVIDENCE || path.join(__dirname, '../../../.artifacts/desktop-control-window-20261022'))
    try {
      const result = await new Promise((resolve, reject) => {
        const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
        const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/desktop-control-main.cjs'), scratch, evidence],
          { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = '', stderr = ''
        const timer = setTimeout(() => { child.kill(); reject(new Error(`Floating control timed out: ${stderr.slice(-3000)}`)) }, 35000)
        child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
        child.on('error', error => { clearTimeout(timer); reject(error) })
        child.on('exit', code => {
          clearTimeout(timer)
          const line = stdout.split(/\r?\n/).find(value => value.startsWith('EDEN_CONTROL_RESULT='))
          if (code !== 0 || !line) reject(new Error(`Floating control failed (${code}): ${stderr.slice(-3500)}`))
          else resolve(JSON.parse(line.slice('EDEN_CONTROL_RESULT='.length)))
        })
      })
      assert.equal(result.passed, true); assert.equal(result.hiddenNativeWindows, true); assert.equal(result.nativeInputPerformed, false)
      assert.equal(result.idleGapsDoNotReopen, true)
      assert.equal(result.manualOpenOnly, true); assert.equal(result.closedCallsDoNotReopen, true)
    } finally {
      assert.equal(path.dirname(scratch), path.resolve(tmpdir()))
      assert.ok(path.basename(scratch).startsWith('eden-floating-control-'))
      await rm(scratch, { recursive: true, force: true })
    }
  })
