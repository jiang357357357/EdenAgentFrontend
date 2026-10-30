import { useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { SharedWorkspacePageView } from "../../src/pages/shared-workspace/SharedWorkspacePageView"
import { SharedWorkspaceStateOwner } from "../../src/components/shared-workspace/shared-workspace-state"
import type { SharedWorkspaceClient, SharedWorkspaceStatus, SharedSpace } from "../../src/lib/shared-workspace-client"
import "../../src/index.css"

// Isolated UI fixture: no credentials, RPC connection, filesystem or Core writes.
const params = new URLSearchParams(window.location.search)
if (params.has('cream')) document.documentElement.dataset.baseTheme = 'cream'
const space: SharedSpace = { id: "preview-space", name: "项目资料", role: params.get("role") === "viewer" ? "viewer" : "owner", hostDeviceId: 'preview-device', hostName: '工作电脑' }
const initialRoot = "E:/EDEN/Agent/Data/realms/mon/accounts/" + "a12b34c56d78e90f".repeat(4) + "/workspace"
const savedPosture = JSON.parse(localStorage.getItem('eden-fixture-posture') ?? 'null')
let posture: { mode: 'lan' | 'cloud'; revision: string } = savedPosture ?? { mode: 'lan', revision: '0' }
const directories = JSON.parse(localStorage.getItem('eden-fixture-directories') ?? 'null') ?? { lan: initialRoot, cloud: params.has('cloud-bound') ? initialRoot : '' }

function Preview() {
  const [root, setRoot] = useState<string>(directories[posture.mode])
  const [revision, setRevision] = useState(0)
  const [, redraw] = useState(0)
  const [back, setBack] = useState(false)
  const owner = useMemo(() => {
    let status: SharedWorkspaceStatus = { available: params.get("state") !== "unavailable", reason: "共享资料库 DLC 尚未启用",
      canPublish: !params.has("receiver"), publishReason: params.has("receiver") ? "共享资料库 DLC 尚未启用" : null,
      bound: params.get("state") === "bound" && root === initialRoot, spaceId: params.get("state") === "bound" && root === initialRoot ? params.has('cloud-bound') ? 'preview-cloud-space' : space.id : null,
      state: params.get("state") === "bound" && root === initialRoot ? "idle" : "unbound", pending: 0, conflicts: 0,
      paused: false, lastSync: null, error: null, root }
    let spaces = params.has("empty") ? [] : [space, { id: "preview-design", name: "设计素材", role: "viewer" as const },
      { id: "preview-team", name: "团队文档", role: "owner" as const }]
    if (params.has('cloud') && !params.has('empty')) spaces.push({ id: 'preview-cloud-space', name: '云端项目资料', role: 'owner', hostDeviceId: 'preview-cloud', hostName: '云端共享主机' })
    let devices = [{ deviceId: "preview-device", name: "工作电脑", revoked: false, local: true }, { deviceId: "preview-laptop", name: "笔记本", revoked: false, local: false }]
    let members = [{ deviceId: "preview-device", name: "工作电脑", role: "owner" as const }, { deviceId: "preview-laptop", name: "笔记本", role: "viewer" as const }]
    const createdFolders: { host: string; parent: string; name: string; path: string }[] = []
    const file = { fileId: "preview-file", path: "notes.txt", revision: 1, deleted: false, sha256: "a".repeat(64), size: 42 }
    const client: SharedWorkspaceClient = {
      directoryPath: root,
      cloudDirectories: async (host, path = host === 'preview-cloud-alt' ? '/srv/alternate' : '/srv/shared') => {
        document.documentElement.dataset.lastCloudBrowseHost = host
        const count = Number(document.documentElement.dataset.cloudBrowseCount ?? '0') + 1
        document.documentElement.dataset.cloudBrowseCount = String(count)
        if (params.has('cloud-fail-once') && count === 1) throw new Error('云主机暂时无法连接，请重试')
        if (params.has('cloud-delay') && host === 'preview-cloud') await new Promise(resolve => setTimeout(resolve, 350))
        return { path, parent: path === '/srv/shared' ? '/srv' : path.slice(0, path.lastIndexOf('/')),
          entries: [...(path === '/srv/shared' ? [{ name: 'docs', path: '/srv/shared/docs' }] : []), ...createdFolders.filter(folder => folder.host === host && folder.parent === path).map(({ name, path }) => ({ name, path }))],
          truncated: false, selectable: true, reason: null }
      },
      createCloudDirectory: async (host, parent, name) => {
        const count = Number(document.documentElement.dataset.cloudCreateCount ?? '0') + 1
        document.documentElement.dataset.cloudCreateCount = String(count)
        if (params.has('cloud-create-fail-once') && count === 1) throw new Error('云主机暂时无法创建文件夹，请重试')
        if (createdFolders.some(folder => folder.host === host && folder.parent === parent && folder.name === name)) throw new Error('已存在同名文件夹或文件，请换个名称')
        const path = `${parent}/${name}`; createdFolders.push({ host, parent, name, path })
        document.documentElement.dataset.lastCreatedCloudDirectory = path
        return { path }
      },
      bindCloudSource: async (_host, spaceId, path) => {
        const source = { path, state: 'idle' as const, pending: 0, conflicts: 0, error: null }
        spaces = spaces.map(space => space.id === spaceId ? { ...space, source } : space)
        return { source }
      },
      cloudSourceConflicts: async () => ({ conflicts: [] }),
      resolveCloudSource: async () => ({ source: { path: '/srv/shared', state: 'idle', pending: 0, conflicts: 0, error: null } }),
      cloudMembers: async () => ({ members }),
      directory: async () => ({ path: directories[posture.mode], revision: posture.revision, status: directories[posture.mode] ? 'ready' : 'unselected', error: null }),
      posture: async () => posture,
      selectPosture: async (mode, expected) => {
        if (expected !== posture.revision) throw new Error('共享姿态已变化')
        if (mode !== posture.mode) posture = { mode, revision: String(Number(posture.revision) + 1) }
        localStorage.setItem('eden-fixture-posture', JSON.stringify(posture))
        return posture
      },
      isCurrent: () => true, invalidate: () => {}, status: async () => status,
      spaces: async () => spaces, devices: async hostId => hostId === 'preview-cloud' ? [{ deviceId: 'preview-cloud-member', name: '云端配对设备', revoked: false, local: false }] : devices,
      hosts: async () => [{ deviceId: 'preview-device', name: '工作电脑', addresses: ['http://192.168.1.10:40195'], local: true,
        reachable: true, canPublish: !params.has('receiver'), canManage: true, dedicated: false, error: null },
      ...(params.has('cloud') ? [{ deviceId: 'preview-cloud', name: '云端共享主机', addresses: ['http://203.0.113.10:40195'], local: false,
        reachable: true, canPublish: true, canManage: true, dedicated: true, directorySources: !params.has('cloud-old'), directoryCreate: !params.has('cloud-browse-only'), error: null }] : []),
      ...(params.has('two-clouds') ? [{ deviceId: 'preview-cloud-alt', name: '备用云主机', addresses: [], local: false,
        reachable: true, canPublish: true, canManage: true, dedicated: true, directorySources: true, directoryCreate: true, error: null }] : [])],
      sshProbe: async () => ({ fingerprint: 'SHA256:' + 'A'.repeat(43) }),
      deployHost: async () => { throw new Error('隔离预览不部署云服务器') },
      deploymentStatus: async () => null, cancelDeployment: async () => { throw new Error('无部署任务') },
      conflicts: async () => [], members: async () => members,
      network: async () => ({ deviceId: "preview-device", name: "工作电脑", addresses: ["http://192.168.1.10:40195"], listening: true, discoveryError: null,
        peers: [{ deviceId: "preview-laptop", name: "笔记本", addresses: ["http://192.168.1.11:40195"], paired: true, discovered: true, revoked: false },
          { deviceId: 'preview-neighbor', name: '附近电脑', addresses: ['http://192.168.1.12:40195'], paired: false, discovered: true, revoked: false }] }),
      invitePairing: async hostId => ({ code: `eden-lan2:隔离预览邀请:${hostId}`, expiresAt: Date.now() + 600_000 }),
      pairDevice: async () => { document.documentElement.dataset.lastPairMode = 'lan'; return { paired: true } },
      connectHost: async () => { document.documentElement.dataset.lastPairMode = 'cloud'; return { paired: true, deviceId: 'preview-cloud' } },
      files: async () => [file], history: async () => [file],
      create: async (name, hostDeviceId, sourceDirectory) => { const created = { id: `preview-${spaces.length}`, role: "owner" as const, name,
        hostDeviceId, hostName: hostDeviceId === 'preview-cloud' ? '云端共享主机' : '工作电脑',
        ...(sourceDirectory ? { source: { path: sourceDirectory, state: 'idle' as const, pending: 0, conflicts: 0, error: null } } : {}) };
        document.documentElement.dataset.lastCloudSource = sourceDirectory ?? ''
        spaces = [...spaces, created]; return { space: created } },
      bind: async id => { document.documentElement.dataset.lastBoundSpace = id; status = { ...status, bound: true, spaceId: id, state: "idle" }; return status },
      sync: async () => { status = { ...status, lastSync: Date.now() }; return status },
      pause: async paused => { status = { ...status, paused, state: paused ? "paused" : "idle" }; return status },
      resolve: async () => status, restore: async () => status,
      setMember: async () => ({ members: [] }), removeMember: async () => ({ members: [] }),
      revokeDevice: async id => { devices = devices.map(device => device.deviceId === id ? { ...device, revoked: true } : device); return { revoked: true } },
    }
    return new SharedWorkspaceStateOwner(client, () => redraw(value => value + 1), () => {}, path => { setRoot(path); setRevision(value => value + 1) })
  }, [root, revision])
  useEffect(() => { owner.activate(); void owner.refresh(true); return () => owner.dispose() }, [owner])
  if (back) return <main className="p-8 text-text"><h1>资源管理器</h1><p>文件视图 · 原会话</p></main>
  return <SharedWorkspacePageView owner={owner} root={root} onBack={() => setBack(true)}
    onChooseWorkspace={() => {
      directories[posture.mode] = 'E:/Projects/共享文档'
      localStorage.setItem('eden-fixture-directories', JSON.stringify(directories))
      setRoot(directories[posture.mode]); setRevision(value => value + 1)
    }} />
}

createRoot(document.getElementById("root")!).render(params.has("narrow")
  ? <iframe title="窄屏共享资料库" src="./shared-workspace-page.html?state=bound&role=viewer" style={{ width: 390, maxWidth: "100%", height: "100vh", border: 0 }} />
  : <Preview />)
