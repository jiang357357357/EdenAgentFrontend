import { ChevronDown, FolderOpen, Laptop } from 'lucide-react'
import type { SharedSpace } from '../../lib/shared-workspace-client'
import type { SharedWorkspaceStateOwner } from './shared-workspace-state'
import { SharedWorkspaceBinding } from './SharedWorkspaceBinding'
import { sharedButtonClass } from './shared-workspace-view'

export function CloudLocalSync({ owner, space, root, busy, onChooseWorkspace }: {
  owner: SharedWorkspaceStateOwner; space: SharedSpace; root: string; busy: boolean; onChooseWorkspace(): void
}) {
  const status = owner.state.status
  const current = status?.bound && status.spaceId === space.id
  const other = status?.bound && !current ? owner.state.spaces.find(item => item.id === status.spaceId) : undefined
  return <details className="group mt-6 border-t border-border/70 pt-5" aria-label="本机同步设置">
    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg py-2 text-left focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
      <Laptop className="h-5 w-5 shrink-0 text-accent" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">同步到这台电脑</span>
        <span className="mt-1 block text-xs text-text-muted">{current ? '已绑定本机目录，点击管理' : '按需设置，用于接收文件和回传修改'}</span></span><ChevronDown className="h-4 w-4 shrink-0 text-text-muted transition group-open:rotate-180" />
    </summary>
    <div className="pt-5">{current ? <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-lg border border-border bg-input p-3"><FolderOpen className="h-4 w-4 shrink-0 text-accent" /><span className="break-all font-mono text-xs text-text-muted">{root}</span></p>
      <button type="button" className={sharedButtonClass} disabled={busy} onClick={onChooseWorkspace}>选择本机同步目录…</button>
    </div> : <SharedWorkspaceBinding cloud key={`${space.id}:${root}`} root={root} spaceId={space.id} busy={busy || owner.state.loading}
      boundSpaceName={other ? other.name : status?.bound ? '其他资料库' : undefined}
      onBind={(id, selectedRoot, confirmed) => owner.bind(id, selectedRoot, confirmed)} onChooseWorkspace={onChooseWorkspace} />}</div>
  </details>
}
