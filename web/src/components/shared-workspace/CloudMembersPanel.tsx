import { useEffect, useRef, useState } from 'react'
import type { SharedDevice, SharedMember, SharedSpace } from '../../lib/shared-workspace-client'
import type { SharedWorkspaceStateOwner } from './shared-workspace-state'
import { SharedWorkspaceMembers } from './SharedWorkspaceMembers'

export function CloudMembersPanel({ owner, space, busy }: { owner: SharedWorkspaceStateOwner; space: SharedSpace; busy: boolean }) {
  const [members, setMembers] = useState<SharedMember[]>([])
  const [devices, setDevices] = useState<SharedDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const load = async () => {
    const current = ++sequence.current
    if (!space.hostDeviceId) return
    setLoading(true)
    try {
      const [result, devices] = await Promise.all([owner.cloudMembers(space.hostDeviceId, space.id), owner.cloudMemberDevices(space.hostDeviceId)])
      if (current !== sequence.current || !owner.isCurrent()) return
      setMembers(result.members); setDevices(devices); setError('')
    } catch (reason) { if (current === sequence.current && owner.isCurrent()) setError(reason instanceof Error ? reason.message : '读取云端权限失败') }
    finally { if (current === sequence.current) setLoading(false) }
  }
  useEffect(() => { void load(); return () => { sequence.current++ } }, [owner, space.id, space.hostDeviceId])
  const change = async (deviceId: string, role?: 'editor' | 'viewer') => {
    if (!space.hostDeviceId) return
    const changed = await owner.changeCloudMember(space.hostDeviceId, space.id, deviceId, role)
    if (changed && owner.isCurrent()) await load()
  }
  return <section className="space-y-4 rounded-xl border border-border/70 bg-library-card p-5" aria-label="云端共享权限">
    <h2 className="text-base font-semibold">云端共享权限 · {space.name}</h2>
    <p className="text-xs text-text-muted">直接管理此云主机的资料库权限，无需先选择本机同步目录。</p>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <SharedWorkspaceMembers members={members} devices={devices} busy={busy || loading} canManage
      onSet={(id, role) => void change(id, role)} onRemove={id => void change(id)} />
  </section>
}
