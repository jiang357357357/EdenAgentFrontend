import type { RpcMethodMap } from "./rpc-contracts"
import { rpcRequest, rpcRequestForOrigin } from "./rpc-transport"
import { getRuntimeOriginRevision, getStoredRuntimeOrigin } from "./runtime-origin"

export type SharedWorkspaceStatus = RpcMethodMap["sharedWorkspace.status"]["result"]
export type SharedSpace = RpcMethodMap["sharedWorkspace.spaces"]["result"]["spaces"][number]
export type SharedConflict = RpcMethodMap["sharedWorkspace.conflicts"]["result"]["conflicts"][number]
export type SharedMember = RpcMethodMap["sharedWorkspace.members"]["result"]["members"][number]
export type SharedFile = RpcMethodMap["sharedWorkspace.files"]["result"]["files"][number]
export type SharedVersion = RpcMethodMap["sharedWorkspace.history"]["result"]["versions"][number]
export type SharedDevice = RpcMethodMap["sharedWorkspace.devices"]["result"]["devices"][number]
export type SharedNetwork = RpcMethodMap["sharedWorkspace.network"]["result"]
export type SharedHost = RpcMethodMap["sharedWorkspace.hosts"]["result"]["hosts"][number]
export type SharedDeploymentInput = RpcMethodMap["sharedWorkspace.deployHost"]["params"]["deployment"]
export type SharedDeploymentJob = RpcMethodMap["sharedWorkspace.deployHost"]["result"]
export type SharedSshTarget = RpcMethodMap["sharedWorkspace.sshProbe"]["params"]["target"]
export type SharedPosture = RpcMethodMap['sharedWorkspace.posture.read']['result']
export const readSharedDirectory = (sessionId: string) => rpcRequest('sharedWorkspace.directory.read', { sessionId })
export async function selectSharedDirectory(sessionId: string, path: string, expectedRevision: string) {
  const result = await rpcRequest('sharedWorkspace.directory.select', { sessionId, path, expectedRevision })
  window.dispatchEvent(new CustomEvent('edenagent:shared-directory-changed', { detail: { path: result.path, sessionId } }))
  return result
}

/** The legacy wire field expectedWorkspacePath now guards the independent shared directory only. */
export function createSharedWorkspaceClient(expectedWorkspacePath: string, sessionId: string) {
  const origin = getStoredRuntimeOrigin() ?? "mon"
  const revision = getRuntimeOriginRevision()
  let active = true
  const isCurrent = () => active && getRuntimeOriginRevision() === revision
  const scoped = { expectedWorkspacePath, sessionId }
  const request = async <K extends keyof RpcMethodMap>(method: K, params: RpcMethodMap[K]["params"]) => {
    if (!isCurrent()) throw new Error("共享目录或账号已切换，请重新打开共享资料库")
    let result: RpcMethodMap[K]["result"]
    try { result = await rpcRequestForOrigin(origin, method, params, revision) }
    catch (error) {
      if (error instanceof Error && error.message === `Method not implemented: ${method}`)
        throw new Error('当前连接的 Agent 后端尚未加载此共享接口，请重启本机 Agent 服务；若仍提示，请配套更新 Agent 前后端。')
      throw error
    }
    if (!isCurrent()) throw new Error("共享目录切换前的操作结果未确认，请刷新核对")
    return result
  }
  return {
    directoryPath: expectedWorkspacePath,
    isCurrent,
    invalidate() { active = false },
    posture: () => request('sharedWorkspace.posture.read', { sessionId }),
    directory: () => request('sharedWorkspace.directory.read', { sessionId }),
    selectPosture: (mode: SharedPosture['mode'], expectedRevision: string) => request('sharedWorkspace.posture.select', { sessionId, mode, expectedRevision }),
    status: async () => {
      const status = await request("sharedWorkspace.status", { sessionId })
      if (status.root && status.root !== expectedWorkspacePath) {
        throw new Error("共享目录已改变，请重新打开共享资料库")
      }
      return status
    },
    spaces: async () => (await request("sharedWorkspace.spaces", scoped)).spaces,
    network: () => request("sharedWorkspace.network", scoped),
    hosts: async () => (await request("sharedWorkspace.hosts", scoped)).hosts,
    sshProbe: (target: SharedSshTarget) => request("sharedWorkspace.sshProbe", { ...scoped, target }),
    deployHost: (deployment: SharedDeploymentInput) => request("sharedWorkspace.deployHost", { ...scoped, deployment }),
    deploymentStatus: (jobId?: string) => request("sharedWorkspace.deploymentStatus", { ...scoped, ...(jobId ? { jobId } : {}) }),
    cancelDeployment: (jobId: string) => request("sharedWorkspace.cancelDeployment", { ...scoped, jobId }),
    invitePairing: (hostDeviceId?: string) => request("sharedWorkspace.invitePairing", { ...scoped, ...(hostDeviceId ? { hostDeviceId } : {}) }),
    connectHost: (code: string, address?: string) => request("sharedWorkspace.connectHost", { ...scoped, code, ...(address ? { address } : {}) }),
    pairDevice: (code: string, address?: string) => request("sharedWorkspace.pairDevice", { ...scoped, code, ...(address ? { address } : {}) }),
    create: (name: string, hostDeviceId?: string, sourceDirectory?: string) => request("sharedWorkspace.create", { ...scoped, name,
      ...(hostDeviceId ? { hostDeviceId } : {}), ...(sourceDirectory ? { sourceDirectory, confirmSource: true } : {}) }),
    cloudDirectories: (hostDeviceId: string, path?: string, after?: string) => request('sharedWorkspace.cloudDirectories', { ...scoped, hostDeviceId,
      ...(path === undefined ? {} : { path }), ...(after === undefined ? {} : { after }) }),
    createCloudDirectory: (hostDeviceId: string, parent: string, name: string) => request('sharedWorkspace.cloudDirectory.create', { ...scoped, hostDeviceId, parent, name }),
    bindCloudSource: (hostDeviceId: string, spaceId: string, path: string) => request('sharedWorkspace.source.bind', { ...scoped, hostDeviceId, spaceId, path, confirmSource: true }),
    cloudSourceConflicts: (hostDeviceId: string, spaceId: string) => request('sharedWorkspace.source.conflicts', { ...scoped, hostDeviceId, spaceId }),
    resolveCloudSource: (hostDeviceId: string, spaceId: string, conflictId: string, strategy: 'local' | 'remote') =>
      request('sharedWorkspace.source.resolve', { ...scoped, hostDeviceId, spaceId, conflictId, strategy }),
    cloudMembers: (hostDeviceId: string, spaceId: string, action: 'list' | 'set' | 'remove', deviceId?: string, role?: 'editor' | 'viewer') =>
      request('sharedWorkspace.cloudMembers', { ...scoped, hostDeviceId, spaceId, action, ...(deviceId ? { deviceId } : {}), ...(role ? { role } : {}) }),
    bind: (spaceId: string) => request("sharedWorkspace.bind", { ...scoped, spaceId, confirmShare: true }),
    sync: () => request("sharedWorkspace.sync", scoped),
    pause: (paused: boolean) => request("sharedWorkspace.pause", { ...scoped, paused }),
    conflicts: async () => (await request("sharedWorkspace.conflicts", scoped)).conflicts,
    resolve: (conflictId: string, strategy: "local" | "remote") => request("sharedWorkspace.resolve", { ...scoped, conflictId, strategy }),
    files: async () => (await request("sharedWorkspace.files", scoped)).files,
    history: async (fileId: string) => (await request("sharedWorkspace.history", { ...scoped, fileId })).versions,
    restore: (fileId: string, revision: number) => request("sharedWorkspace.restore", { ...scoped, fileId, revision }),
    members: async () => (await request("sharedWorkspace.members", { ...scoped, action: "list" })).members,
    setMember: (deviceId: string, role: "editor" | "viewer") => request("sharedWorkspace.members", { ...scoped, action: "set", deviceId, role }),
    removeMember: (deviceId: string) => request("sharedWorkspace.members", { ...scoped, action: "remove", deviceId }),
    devices: async (hostDeviceId?: string) => (await request("sharedWorkspace.devices", { ...scoped, ...(hostDeviceId ? { hostDeviceId } : {}) })).devices,
    revokeDevice: (deviceId: string, hostDeviceId?: string) => request("sharedWorkspace.revokeDevice", { ...scoped, deviceId, ...(hostDeviceId ? { hostDeviceId } : {}) }),
  }
}

export type SharedWorkspaceClient = ReturnType<typeof createSharedWorkspaceClient>
