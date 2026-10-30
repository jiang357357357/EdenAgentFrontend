import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { SharedWorkspaceStateOwner } from './shared-workspace-state'
import { sharedButtonClass, sharedInputClass, sharedPrimaryButtonClass } from './shared-workspace-view'

export function CloudFolderCreate({ owner, hostId, parent, disabled, onBusy, onCreated, onCancel }: {
  owner: SharedWorkspaceStateOwner; hostId: string; parent: string; disabled: boolean
  onBusy(busy: boolean): void; onCreated(path: string): void; onCancel(): void
}) {
  const [name, setName] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const supported = owner.state.hosts.some(host => host.deviceId === hostId && host.directoryCreate === true)
  useEffect(() => () => { generation.current++ }, [owner, hostId, parent])
  const create = async () => {
    if (working || disabled || !supported || !name.trim() || !owner.isCurrent()) return
    const sequence = ++generation.current
    const current = () => sequence === generation.current && owner.isCurrent()
    setWorking(true); setError(''); onBusy(true)
    try {
      const result = await owner.createCloudDirectory(hostId, parent, name.trim().normalize('NFC'))
      if (current()) onCreated(result.path)
    } catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : '创建云端文件夹失败') }
    finally { if (current()) { setWorking(false); onBusy(false) } }
  }
  return <form className="space-y-3 border-b border-border/70 bg-accent/5 p-4" aria-label="新建云端文件夹"
    onSubmit={event => { event.preventDefault(); void create() }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!working) onCancel() } }}>
    {supported ? <>
      <label className="block space-y-2 text-sm"><span>文件夹名称</span><input aria-label="新文件夹名称" autoFocus maxLength={255} value={name} disabled={disabled || working} className={sharedInputClass}
        placeholder="例如：项目资料" onChange={event => { setName(event.target.value); setError('') }} /></label>
      <p className="truncate text-xs text-text-muted" title={parent}>创建位置：{parent}</p>
    </> : <p role="alert" className="text-sm leading-relaxed text-text-muted">此云主机尚不支持新建文件夹，请更新共享服务后使用；仍可选择已有文件夹。</p>}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <div className="flex justify-end gap-2"><button type="button" className={sharedButtonClass} disabled={working} onClick={onCancel}>取消新建文件夹</button>
      {supported ? <button type="submit" className={`${sharedPrimaryButtonClass} inline-flex items-center gap-2`} disabled={disabled || working || !name.trim()}>{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{working ? '正在创建…' : '创建文件夹'}</button> : null}</div>
  </form>
}
