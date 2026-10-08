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
    const result = await rpcRequestForOrigin(origin, method, params, revision)
    if (!isCurrent()) throw new Error("共享目录切换前的操作结果未确认，请刷新核对")
    return result
  }
  return {
    isCurrent,
    invalidate() { active = false },
    status: async () => {
      const status = await request("sharedWorkspace.status", { sessionId })
      if (status.root && status.root !== expectedWorkspacePath) {
        throw new Error("共享目录已改变，请重新打开共享资料库")
      }
      return status
    },
    spaces: async () => (await request("sharedWorkspace.spaces", scoped)).spaces,
    network: () => request("sharedWorkspace.network", scoped),
    invitePairing: () => request("sharedWorkspace.invitePairing", scoped),
    pairDevice: (code: string, address?: string) => request("sharedWorkspace.pairDevice", { ...scoped, code, ...(address ? { address } : {}) }),
    create: (name: string) => request("sharedWorkspace.create", { ...scoped, name }),
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
    devices: async () => (await request("sharedWorkspace.devices", scoped)).devices,
    revokeDevice: (deviceId: string) => request("sharedWorkspace.revokeDevice", { ...scoped, deviceId }),
  }
}

export type SharedWorkspaceClient = ReturnType<typeof createSharedWorkspaceClient>
