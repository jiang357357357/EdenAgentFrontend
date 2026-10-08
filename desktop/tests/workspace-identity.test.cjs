const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { workspaceIdentity } = require('../src/processes/workspace-identity.cjs')
const { createWorkspaceContext } = require('../src/app/workspace-context.cjs')

test('portable desktop belongs to its executable installation despite source cwd and environment', context => {
  const root = mkdtempSync(path.join(tmpdir(), 'eden-installation-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const portable = path.join(root, 'EDEN-portable', 'EDEN_win')
  const runtime = path.join(portable, 'runtime', 'agent')
  const exe = path.join(portable, 'apps', 'eden-agent', 'eden-agent.exe')
  for (const directory of [root, portable, runtime, path.dirname(exe)]) mkdirSync(directory, { recursive: true })
  for (const directory of [root, portable]) {
    writeFileSync(path.join(directory, '.monconfig'), '')
    writeFileSync(path.join(directory, '.monworkspace'), '{}')
  }
  writeFileSync(path.join(runtime, '.monconfig'), 'SERVICE_ID=edenagent')
  const result = createWorkspaceContext({ app: { isPackaged: true }, moduleDir: path.dirname(exe),
    processObject: { env: { EDEN_AGENT_ROOT: path.join(root, 'Agent'), MON_WORKSPACE_ROOT: root },
      execPath: exe, resourcesPath: path.join(path.dirname(exe), 'resources'), cwd: () => root, platform: process.platform } })
  assert.equal(result.workspaceRoot, portable)
  assert.equal(result.agentRoot, runtime)
  assert.notEqual(workspaceIdentity(root).workspaceId, workspaceIdentity(runtime).workspaceId)
  assert.equal(workspaceIdentity(portable).workspaceId, workspaceIdentity(runtime).workspaceId)
})
