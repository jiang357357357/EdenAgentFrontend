import { useId, useState } from "react"
import type { SharedMember, SharedDevice } from "../../lib/shared-workspace-client"
import { sharedButtonClass, sharedInputClass } from "./shared-workspace-view"

export function SharedWorkspaceMembers({ members, devices = [], busy, canManage, onSet, onRemove }: {
  members: SharedMember[]
  devices?: SharedDevice[]
  busy: boolean
  canManage: boolean
  onSet(deviceId: string, role: "editor" | "viewer"): void
  onRemove(deviceId: string): void
}) {
  const id = useId()
  const [deviceId, setDeviceId] = useState("")
  const [role, setRole] = useState<"editor" | "viewer">("viewer")
  const candidates = devices.filter(device => !device.revoked && !device.local && !members.some(member => member.deviceId === device.deviceId && member.role === "owner"))
  return <section aria-label="资料库成员" className="space-y-3">
    <p className="text-sm text-text-muted">只读设备可接收文件与查看历史；可编辑设备可双向同步与恢复文件。先在“设备配对”中配对电脑，再授予此资料库的权限。</p>
    {members.map(member => <div key={member.deviceId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
      <span>{member.name}<span className="mt-1 block break-all font-mono text-xs text-text-muted">{member.deviceId}</span></span>
      {member.role === "owner" ? <span className="text-text-muted">发布设备</span> : <div className="flex gap-2">
        <select aria-label={`${member.name} 的权限`} value={member.role} disabled={busy || !canManage} className={sharedInputClass}
          onChange={event => onSet(member.deviceId, event.target.value as "editor" | "viewer")}>
          <option value="viewer">只读</option><option value="editor">可编辑</option>
        </select>
        <button type="button" className={sharedButtonClass} disabled={busy || !canManage} onClick={() => onRemove(member.deviceId)}>移除权限</button>
      </div>}
    </div>)}
    {canManage ? <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (candidates.some(device => device.deviceId === deviceId)) onSet(deviceId, role) }}>
      <label className="min-w-40 flex-1 space-y-1 text-sm" htmlFor={id}><span>授权已配对设备</span>
        <select id={id} aria-label="选择已配对设备" className={sharedInputClass} disabled={busy} value={deviceId} onChange={event => setDeviceId(event.target.value)}>
          <option value="">请选择设备</option>{candidates.map(device => <option key={device.deviceId} value={device.deviceId}>{device.name}</option>)}
        </select></label>
      <select aria-label="新设备权限" className={`${sharedInputClass} max-w-32`} value={role} disabled={busy}
        onChange={event => setRole(event.target.value as "editor" | "viewer")}><option value="viewer">只读</option><option value="editor">可编辑</option></select>
      <button type="submit" className={sharedButtonClass} disabled={busy || !candidates.some(device => device.deviceId === deviceId)}>授予或更新权限</button>
      {!candidates.length ? <p className="w-full text-xs text-text-muted">暂无可授权的设备，请先进入“设备配对”完成局域网配对。</p> : null}
    </form> : null}
  </section>
}
