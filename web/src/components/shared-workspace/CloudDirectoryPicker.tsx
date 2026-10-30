import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUp, ChevronRight, Cloud, Folder, FolderPlus, LoaderCircle, RefreshCw } from 'lucide-react'
import type { SharedWorkspaceStateOwner } from './shared-workspace-state'
import { sharedButtonClass, sharedInputClass, sharedPrimaryButtonClass } from './shared-workspace-view'
import { CloudFolderCreate } from './CloudFolderCreate'

type Listing = Awaited<ReturnType<SharedWorkspaceStateOwner['cloudDirectories']>>

export function CloudDirectoryPicker({ owner, hostId, disabled, onSelect, embedded = false, initialPath }: {
  owner: SharedWorkspaceStateOwner; hostId: string; disabled: boolean; onSelect(path: string): void
  embedded?: boolean; initialPath?: string
}) {
  const [open, setOpen] = useState(embedded)
  const [listing, setListing] = useState<Listing | null>(null)
  const [requested, setRequested] = useState(initialPath ?? '')
  const [loading, setLoading] = useState(embedded)
  const [error, setError] = useState('')
  const [newFolder, setNewFolder] = useState(false)
  const [creatingDirectory, setCreatingDirectory] = useState(false)
  const [notice, setNotice] = useState('')
  const blocked = disabled || creatingDirectory
  const generation = useRef(0)
  useEffect(() => {
    setNewFolder(false); setCreatingDirectory(false); setNotice('')
    if (embedded) void browse(initialPath)
    return () => { generation.current++ }
  }, [owner, hostId, embedded, initialPath])
  const browse = async (directory?: string, more = false) => {
    const sequence = ++generation.current
    setLoading(true); setError(''); setNewFolder(false); setNotice('')
    try {
      const after = more ? listing?.entries.at(-1)?.name : undefined
      const result = await owner.cloudDirectories(hostId, directory, after)
      if (sequence !== generation.current || !owner.isCurrent()) return
      setListing(previous => more && previous?.path === result.path ? { ...result, entries: [...previous.entries, ...result.entries] } : result)
      setRequested(result.path)
    } catch (reason) {
      if (sequence === generation.current && owner.isCurrent()) setError(reason instanceof Error ? reason.message : '读取云端目录失败')
    } finally { if (sequence === generation.current) setLoading(false) }
  }
  const toggle = () => {
    setOpen(!open)
    if (!open) void browse(listing?.path)
    else { generation.current++; setLoading(false) }
  }
  const openCreated = async (path: string) => {
    const sequence = generation.current + 1
    await browse(path)
    if (generation.current === sequence && owner.isCurrent()) setNotice('文件夹已创建，尚未共享；可继续选择并确认共享。')
  }
  return <div className="space-y-3" aria-label="云端源目录选择器">
    {!embedded ? <button type="button" className={`${sharedButtonClass} inline-flex items-center gap-2`} disabled={blocked || !hostId} onClick={toggle} aria-expanded={open}>
      <Cloud className="h-4 w-4" />{open ? '收起云端目录' : '从云主机选择源目录…'}
    </button> : null}
    {open ? <div className="overflow-hidden rounded-xl border border-border bg-library-card/50">
      <div className="flex items-center gap-2 border-b border-border/70 p-3">
          <button type="button" className={`${sharedButtonClass} shrink-0 p-2.5`} disabled={loading || blocked || !listing?.parent} aria-label="云端上级目录" onClick={() => void browse(listing!.parent!)}><ArrowUp className="h-4 w-4" /></button>
          <input aria-label="云端绝对路径" className={`${sharedInputClass} min-w-0 flex-1 font-mono text-xs`} value={requested} disabled={loading || blocked}
          onChange={event => setRequested(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void browse(requested) } }} />
          <button type="button" className={`${sharedButtonClass} shrink-0 p-2.5`} aria-label="打开云端路径" disabled={loading || blocked || !requested.trim()} onClick={() => void browse(requested)}><ArrowRight className="h-4 w-4" /></button>
          <button type="button" className={`${sharedButtonClass} shrink-0 p-2.5`} disabled={loading || blocked} aria-label="刷新云端目录" onClick={() => void browse(listing?.path ?? initialPath)}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2"><span className="text-xs text-text-muted">云端文件夹</span>
        <button type="button" className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-accent hover:bg-accent/10 disabled:opacity-40" disabled={loading || blocked || !listing || !!error || owner.state.status?.canPublish === false}
          onClick={() => { setNewFolder(true); setNotice('') }}><FolderPlus className="h-4 w-4" />新建文件夹</button></div>
      {newFolder && listing ? <CloudFolderCreate key={`${hostId}:${listing.path}`} owner={owner} hostId={hostId} parent={listing.path} disabled={disabled}
        onBusy={setCreatingDirectory} onCancel={() => setNewFolder(false)} onCreated={path => void openCreated(path)} /> : null}
      {notice ? <p role="status" className="px-4 pt-3 text-xs text-success">{notice}</p> : null}
      {error ? <div className="space-y-3 p-5"><p role="alert" className="text-sm leading-relaxed text-danger">{error}</p><button type="button" className={sharedButtonClass} disabled={loading || disabled} onClick={() => void browse(requested || initialPath)}>重试读取目录</button></div> : null}
      {loading ? <p role="status" className="flex items-center gap-2 px-5 py-6 text-sm text-text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />正在读取云端目录…</p> : null}
      {listing && !loading && !error ? <>
        <div className="max-h-72 min-h-32 space-y-1 overflow-auto p-2" aria-label="云端文件夹列表">
          {listing.entries.map(entry => <button key={entry.path} type="button" className="group flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-sm transition hover:bg-accent/10 focus-visible:outline-accent disabled:opacity-40"
            disabled={blocked} onClick={() => void browse(entry.path)}><Folder className="h-5 w-5 shrink-0 text-accent" /><span className="min-w-0 flex-1 break-all">{entry.name}</span><ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition group-hover:translate-x-0.5" /></button>)}
          {!listing.entries.length ? <p className="px-3 py-7 text-sm text-text-muted">{listing.selectable ? '此文件夹没有子文件夹，可以直接使用当前文件夹。' : '此文件夹没有可浏览的子文件夹。'}</p> : null}
          {listing.truncated ? <button type="button" className={sharedButtonClass} disabled={loading || blocked} onClick={() => void browse(listing.path, true)}>加载更多文件夹</button> : null}
        </div>
        {listing.reason ? <p className="px-5 pb-3 text-xs text-text-muted">{listing.reason}</p> : null}
      </> : null}
      <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-4 sm:flex-row sm:items-center"><p className="min-w-0 flex-1 truncate font-mono text-xs text-text-muted" title={listing?.path}>当前文件夹 · {listing?.path || '尚未读取'}</p>
        <button type="button" className={`${embedded ? sharedPrimaryButtonClass : sharedButtonClass} shrink-0`} disabled={loading || blocked || newFolder || !listing?.selectable || !!error}
          onClick={() => { if (!listing) return; onSelect(listing.path); if (!embedded) setOpen(false); generation.current++ }}>{embedded ? '使用这个文件夹' : '选择此云端目录'}</button></div>
    </div> : null}
  </div>
}
