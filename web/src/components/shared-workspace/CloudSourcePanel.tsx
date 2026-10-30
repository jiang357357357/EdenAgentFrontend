import { useEffect, useRef, useState } from 'react'
import { Cloud } from 'lucide-react'
import type { SharedConflict, SharedSpace } from '../../lib/shared-workspace-client'
import type { SharedWorkspaceStateOwner } from './shared-workspace-state'
import { CloudDirectoryPicker } from './CloudDirectoryPicker'
import { sharedButtonClass, sharedPrimaryButtonClass } from './shared-workspace-view'

export function CloudSourcePanel({ owner, space, busy }: { owner: SharedWorkspaceStateOwner; space: SharedSpace; busy: boolean }) {
  const [directory, setDirectory] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [conflicts, setConflicts] = useState<SharedConflict[]>([])
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const host = owner.state.hosts.find(host => host.deviceId === space.hostDeviceId)
  const canManage = !!host?.canManage && host.dedicated
  const source = space.source
  useEffect(() => {
    const current = ++sequence.current
    if (!canManage || !space.hostDeviceId || !source?.conflicts) { setConflicts([]); setError(''); return }
    void owner.cloudSourceConflicts(space.hostDeviceId, space.id).then(result => {
      if (current === sequence.current && owner.isCurrent()) { setConflicts(result.conflicts); setError('') }
    }).catch(reason => { if (current === sequence.current && owner.isCurrent()) setError(reason instanceof Error ? reason.message : '读取云端冲突失败') })
    return () => { sequence.current++ }
  }, [owner, space.id, space.hostDeviceId, source?.conflicts, canManage])
  return <section className="space-y-4 border-b border-border/70 pb-5" aria-label="云端共享源目录">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><Cloud className="h-4 w-4 text-accent" />云端共享源目录</h3>
    {source ? <>
      <p className="break-all font-mono text-xs text-text-muted">{source.path}</p>
      <p className="text-xs text-text-muted">{source.state === 'offline' ? '云端源目录暂不可用' : source.state === 'conflict' ? '云端源目录有待处理冲突' : source.state === 'syncing' ? '云端源目录正在同步' : '云端源目录已接入资料库'} · 待同步 {source.pending} · 冲突 {source.conflicts}</p>
      {source.error ? <p role="alert" className="text-xs text-danger">{source.error}</p> : null}
    </> : <p className="text-xs leading-relaxed text-text-muted">{canManage ? '请先从云主机选择要共享的现有文件夹。原有资料库与历史保留，首次接入产生的冲突会保留双方版本。' : '云端源目录由主机管理员管理；接收资料时只需另选本机同步目录。'}</p>}
    {canManage && owner.state.status?.canPublish !== false && !source && space.hostDeviceId ? <>
      <CloudDirectoryPicker key={`${space.id}:${space.hostDeviceId}`} owner={owner} hostId={space.hostDeviceId} disabled={busy}
        onSelect={path => { setDirectory(path); setConfirmed(false) }} />
      {directory ? <p className="break-all font-mono text-xs">所选云端目录：{directory}</p> : null}
      <label className="flex items-start gap-2 text-xs leading-relaxed text-text-muted"><input type="checkbox" checked={confirmed} disabled={busy || !directory}
        onChange={event => setConfirmed(event.target.checked)} /><span>我确认将此云端目录的文件共享给资料库成员，并接收已授权成员的修改。</span></label>
      <button type="button" className={sharedPrimaryButtonClass} disabled={busy || !directory || !confirmed}
        onClick={() => void owner.bindCloudSource(space.hostDeviceId!, space.id, directory)}>绑定云端源目录</button>
    </> : null}
    {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    {conflicts.map(conflict => <div key={conflict.id} className="space-y-2 border-t border-border pt-3">
      <p className="break-all text-xs">云端源目录冲突：{conflict.path}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={sharedButtonClass} disabled={busy} onClick={() => void owner.resolveCloudSource(space.hostDeviceId!, space.id, conflict.id, 'local')}>保留云端目录版本</button>
        <button type="button" className={sharedButtonClass} disabled={busy} onClick={() => void owner.resolveCloudSource(space.hostDeviceId!, space.id, conflict.id, 'remote')}>采用资料库版本并保留备份</button>
      </div>
    </div>)}
    <p className="text-xs leading-relaxed text-text-muted">云端目录与本机同步目录是两个独立位置。云端源目录在本机退出后仍由云主机维护。</p>
  </section>
}
