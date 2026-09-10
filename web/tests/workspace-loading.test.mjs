import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [sidebarSource, clientSource, transportSource] = await Promise.all([
  readFile(new URL("../src/components/layout/Sidebar.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/agent-client.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/rpc-transport.ts", import.meta.url), "utf8"),
])

test("workspace loading has a bounded timeout and an explicit retry", () => {
  assert.match(clientSource, /rpcRequestWithTimeout\("workspace\.info", \{\}, 8_000\)/)
  assert.match(clientSource, /rpcRequestWithTimeout\("workspace\.list", \{ path \}, 8_000\)/)
  assert.match(transportSource, /Promise\.race\(/)
  assert.match(transportSource, /请求 \$\{String\(method\)\} 超时/)
  assert.match(sidebarSource, /const workspace = await getWorkspace\(\)/)
  assert.match(sidebarSource, /const retryWorkspace = \(\) =>/)
  assert.match(sidebarSource, />重新读取<\/button>/)
})

test("an unselected workspace skips directory queries and preserves an explicit empty state", () => {
  assert.match(sidebarSource, /if \(!workspace\.path\) \{ setWorkspaceEntries\(\[\]\); return \}/)
  assert.ok(sidebarSource.indexOf('if (!workspace.path)') < sidebarSource.indexOf('const directory = await listWorkspaceDirectory()'))
  assert.match(sidebarSource, /if \(!disposed\) setWorkspaceEntries\(directory\.entries\)/)
})

test("workspace switching is available before the first chat session exists", () => {
  assert.match(clientSource, /const auditSessionId = sessionId \|\| \(await createSessionRaw\(\)\)\.id/)
  assert.match(clientSource, /return \{ \.\.\.result, auditSessionId, createdAuditSession \}/)
  assert.match(sidebarSource, /switchWorkspace\(activeId \|\| sessions\[0\]\?\.id, selected\)/)
  assert.match(sidebarSource, /if \(result\.createdAuditSession\) onSelect\(result\.auditSessionId\)/)
  assert.doesNotMatch(sidebarSource, /disabled=\{!window\.edenAgentDesktop \|\| !activeId\}/)
  assert.doesNotMatch(sidebarSource, /请先打开一个会话，再切换工作区/)
  assert.match(sidebarSource, /workspaceSwitching \|\| Boolean\(workspacePending\)/)
})

test("workspace switching refreshes after both events and missed-event reconciliation", () => {
  assert.match(sidebarSource, /edenagent:workspace-switch-failed/)
  assert.match(sidebarSource, /const reconcileWorkspace = async \(\) =>/)
  assert.match(sidebarSource, /if \(workspace\.pendingPath\)/)
  assert.match(sidebarSource, /setWorkspaceEntries\(directory\.entries\)/)
  assert.match(sidebarSource, /sameWorkspacePath\(workspace\.path, requestedPath\)/)
})
