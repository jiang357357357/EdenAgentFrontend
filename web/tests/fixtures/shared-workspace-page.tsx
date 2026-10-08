import { useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { SharedWorkspacePageView } from "../../src/pages/shared-workspace/SharedWorkspacePageView"
import { SharedWorkspaceStateOwner } from "../../src/components/shared-workspace/shared-workspace-state"
import type { SharedWorkspaceClient, SharedWorkspaceStatus } from "../../src/lib/shared-workspace-client"
import "../../src/index.css"

// Isolated UI fixture: no credentials, RPC connection, filesystem or Core writes.
const params = new URLSearchParams(window.location.search)
const space = { id: "preview-space", name: "项目资料", role: params.get("role") === "viewer" ? "viewer" as const : "owner" as const }
const initialRoot = "E:/EDEN/Agent/Data/realms/mon/accounts/" + "a12b34c56d78e90f".repeat(4) + "/workspace"

function Preview() {
  const [root, setRoot] = useState(initialRoot)
  const [revision, setRevision] = useState(0)
  const [, redraw] = useState(0)
  const [back, setBack] = useState(false)
  const owner = useMemo(() => {
    let status: SharedWorkspaceStatus = { available: params.get("state") !== "unavailable", reason: "共享资料库 DLC 尚未启用",
      canPublish: !params.has("receiver"), publishReason: params.has("receiver") ? "共享资料库 DLC 尚未启用" : null,
      bound: params.get("state") === "bound" && root === initialRoot, spaceId: params.get("state") === "bound" && root === initialRoot ? space.id : null,
      state: params.get("state") === "bound" && root === initialRoot ? "idle" : "unbound", pending: 0, conflicts: 0,
      paused: false, lastSync: null, error: null, root }
    let spaces = params.has("empty") ? [] : [space, { id: "preview-design", name: "设计素材", role: "viewer" as const },
      { id: "preview-team", name: "团队文档", role: "owner" as const }]
    let devices = [{ deviceId: "preview-device", name: "工作电脑", revoked: false, local: true }, { deviceId: "preview-laptop", name: "笔记本", revoked: false, local: false }]
    let members = [{ deviceId: "preview-device", name: "工作电脑", role: "owner" as const }, { deviceId: "preview-laptop", name: "笔记本", role: "viewer" as const }]
    const file = { fileId: "preview-file", path: "notes.txt", revision: 1, deleted: false, sha256: "a".repeat(64), size: 42 }
    const client: SharedWorkspaceClient = {
      isCurrent: () => true, invalidate: () => {}, status: async () => status,
      spaces: async () => spaces, devices: async () => devices,
      conflicts: async () => [], members: async () => members,
      network: async () => ({ deviceId: "preview-device", name: "工作电脑", addresses: ["http://192.168.1.10:40195"], listening: true, discoveryError: null,
        peers: [{ deviceId: "preview-laptop", name: "笔记本", addresses: ["http://192.168.1.11:40195"], paired: true, discovered: true, revoked: false }] }),
      invitePairing: async () => ({ code: "eden-lan2:隔离预览邀请", expiresAt: Date.now() + 600_000 }),
      pairDevice: async () => ({ paired: true }),
      files: async () => [file], history: async () => [file],
      create: async name => { const created = { id: `preview-${spaces.length}`, role: "owner" as const, name }; spaces = [...spaces, created]; return { space: created } },
      bind: async id => { status = { ...status, bound: true, spaceId: id, state: "idle" }; return status },
      sync: async () => { status = { ...status, lastSync: Date.now() }; return status },
      pause: async paused => { status = { ...status, paused, state: paused ? "paused" : "idle" }; return status },
      resolve: async () => status, restore: async () => status,
      setMember: async () => ({ members: [] }), removeMember: async () => ({ members: [] }),
      revokeDevice: async id => { devices = devices.map(device => device.deviceId === id ? { ...device, revoked: true } : device); return { revoked: true } },
    }
    return new SharedWorkspaceStateOwner(client, () => redraw(value => value + 1))
  }, [root, revision])
  useEffect(() => { owner.activate(); void owner.refresh(true); return () => owner.dispose() }, [owner])
  if (back) return <main className="p-8 text-text"><h1>资源管理器</h1><p>文件视图 · 原会话</p></main>
  return <SharedWorkspacePageView owner={owner} root={root} onBack={() => setBack(true)}
    onChooseWorkspace={() => { setRoot("E:/Projects/共享文档"); setRevision(value => value + 1) }} />
}

createRoot(document.getElementById("root")!).render(params.has("narrow")
  ? <iframe title="窄屏共享资料库" src="./shared-workspace-page.html?state=bound&role=viewer" style={{ width: 390, maxWidth: "100%", height: "100vh", border: 0 }} />
  : <Preview />)
