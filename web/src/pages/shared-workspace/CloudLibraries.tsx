import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, Cloud, Folder, FolderPlus, Plus, Search } from 'lucide-react'
import type { SharedSpace } from '../../lib/shared-workspace-client'
import type { SharedWorkspaceStateOwner } from '../../components/shared-workspace/shared-workspace-state'
import { hostsInMode, spacesInMode } from '../../components/shared-workspace/shared-workspace-mode'
import { sharedPrimaryButtonClass, sharedSpaceRole } from '../../components/shared-workspace/shared-workspace-view'
import { SharedWorkspaceDetail } from './SharedWorkspaceDetail'
import { CloudLibraryCreate } from './CloudLibraryCreate'

export function CloudLibraries({ owner, selected, root, busy, onSelect, onChooseWorkspace, onManageHost }: {
  owner: SharedWorkspaceStateOwner; selected?: SharedSpace; root: string; busy: boolean
  onSelect(id: string): void; onChooseWorkspace(): void; onManageHost(): void
}) {
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const { status } = owner.state
  const hosts = hostsInMode(owner.state.hosts, 'cloud')
  const publishers = hosts.filter(host => host.canManage && host.canPublish && host.reachable)
  const spaces = spacesInMode(owner.state.spaces, owner.state.hosts, 'cloud')
  const currentHost = hosts.find(host => host.deviceId === owner.state.managementHostId) ?? hosts[0]
  const canPublish = status?.canPublish !== false
  const canCreate = canPublish && publishers.length > 0
  useEffect(() => { setCreating(false); setQuery('') }, [owner])
  const begin = () => { owner.clearFeedback(); setCreating(true) }
  const back = () => { owner.clearFeedback(); setCreating(false) }
  if (creating) return <CloudLibraryCreate owner={owner} hosts={publishers} busy={busy} onCancel={back} onManageHost={onManageHost}
    onCreated={id => { setCreating(false); onSelect(id) }} />
  if (selected) return <div className="space-y-5">
    <button type="button" className="inline-flex items-center gap-2 text-sm text-accent hover:underline disabled:opacity-40" disabled={busy} onClick={() => { owner.clearFeedback(); onSelect('') }}><ArrowLeft className="h-4 w-4" />返回资料库</button>
    <SharedWorkspaceDetail mode="cloud" owner={owner} space={selected} root={root} busy={busy} onChooseWorkspace={onChooseWorkspace} />
  </div>
  const filtered = spaces.filter(space => space.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <section className="space-y-7" aria-label="云端资料库">
    <div className="flex flex-wrap items-start gap-4"><div className="min-w-0 flex-1"><h2 className="text-2xl font-semibold">云端资料库</h2>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-muted"><Cloud className="h-4 w-4" /><span className="break-words">{currentHost?.name ?? '尚未连接云主机'}</span>{currentHost ? <span className={currentHost.reachable ? 'text-success' : 'text-warning'}>· {currentHost.reachable ? '已连接' : '暂不可达'}</span> : null}</p></div>
      <button type="button" className={`${sharedPrimaryButtonClass} inline-flex items-center gap-2`} disabled={busy || !canCreate} title={!canPublish ? '发布资料库需要启用共享资料库 DLC' : !publishers.length ? '先连接可管理的云主机' : undefined} onClick={begin}><Plus className="h-4 w-4" />新建资料库</button></div>
    {spaces.length ? <>
      <label className="flex max-w-sm items-center gap-2 rounded-lg border border-border bg-input px-3 py-2"><Search className="h-4 w-4 shrink-0 text-text-muted" /><input aria-label="搜索资料库" className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="搜索资料库…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <nav className="divide-y divide-border/70 border-y border-border/70" aria-label="选择资料库">
        {filtered.map(space => <button key={space.id} type="button" aria-label={`选择资料库：${space.name}`} className="group flex w-full items-center gap-4 px-2 py-5 text-left transition hover:bg-accent/5 focus-visible:outline-accent disabled:opacity-40" disabled={busy} onClick={() => onSelect(space.id)}>
          <span className="rounded-xl bg-accent/10 p-3 text-accent"><Folder className="h-6 w-6" /></span><span className="min-w-0 flex-1"><span className="block break-words font-medium">{space.name}</span><span className="mt-1 block break-words text-xs text-text-muted">{space.hostName || '云主机'} · {sharedSpaceRole(space.role)}{space.reachable === false ? ' · 暂不可达' : ''}</span></span><ChevronRight className="h-5 w-5 shrink-0 text-text-muted transition group-hover:translate-x-1" /></button>)}
        {!filtered.length ? <p className="py-8 text-sm text-text-muted">没有匹配的资料库。</p> : null}
      </nav>
    </> : <div className="mx-auto flex max-w-lg flex-col items-center px-3 py-12 text-center sm:py-20">
      <FolderPlus className="mb-5 h-14 w-14 text-accent/60" strokeWidth={1.3} /><h3 className="text-xl font-semibold">还没有云端资料库</h3>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">{canCreate ? '选择云主机上的文件夹，创建共享资料库。' : canPublish ? '先连接可管理的云主机，再选择共享文件夹。' : '连接云主机并获得授权后，即可接收共享资料。'}</p>
      <button type="button" className={`${sharedPrimaryButtonClass} mt-6 inline-flex items-center gap-2`} disabled={busy} onClick={canCreate ? begin : onManageHost}>{canCreate ? <Folder className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}{canCreate ? '选择云端文件夹' : '连接云主机'}</button>
    </div>}
  </section>
}
