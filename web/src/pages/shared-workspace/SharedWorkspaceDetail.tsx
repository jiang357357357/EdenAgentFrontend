import { Folder, FolderOpen } from "lucide-react"
import { SharedWorkspaceBinding } from "../../components/shared-workspace/SharedWorkspaceBinding"
import type { SharedWorkspaceStateOwner } from "../../components/shared-workspace/shared-workspace-state"
import { sharedButtonClass, sharedSpaceRole } from "../../components/shared-workspace/shared-workspace-view"
import type { SharedSpace } from "../../lib/shared-workspace-client"
import { CloudSourcePanel } from '../../components/shared-workspace/CloudSourcePanel'
import { CloudLocalSync } from '../../components/shared-workspace/CloudLocalSync'
import type { SharedWorkspaceMode } from '../../components/shared-workspace/shared-workspace-mode'

export function SharedWorkspaceDetail({ mode = 'lan', owner, space, busy, root, onChooseWorkspace }: {
  mode?: SharedWorkspaceMode
  owner: SharedWorkspaceStateOwner
  space: SharedSpace | undefined
  busy: boolean
  root: string
  onChooseWorkspace(): void
}) {
  const { status } = owner.state
  const current = Boolean(space && status?.bound && status.spaceId === space.id)
  const boundSpace = owner.state.spaces.find(item => item.id === status?.spaceId)
  const blocked = Boolean(status?.bound && !current)
  return <div className="min-w-0 space-y-5">
    <section className="overflow-hidden rounded-xl border border-border/70 bg-library-card" aria-label="资料库详情">
      <DetailHeader owner={owner} space={space} current={current} cloud={mode === 'cloud'} />
      <div className="border-t border-border/70 p-5 sm:p-6">
        {mode === 'cloud' && space ? <CloudSourcePanel key={space.id} owner={owner} space={space} busy={busy} /> : null}
        {mode === 'cloud' && space ? <CloudLocalSync owner={owner} space={space} root={root} busy={busy} onChooseWorkspace={onChooseWorkspace} /> : !space ? <div className="py-10 text-center">
          <FolderOpen className="mx-auto mb-4 h-10 w-10 text-accent/60" />
          <h3 className="text-base font-medium">先选择资料库</h3>
          <p className="mt-2 text-sm text-text-muted">{status?.canPublish === false ? "配对发布电脑并获得授权后，从左侧选择资料库。" : "从左侧选择已有资料库，或新建一个资料库。"}</p>
        </div> : current ? <div className="space-y-3">
          <h3 className="text-sm font-semibold">{mode === 'cloud' ? '本机同步目录' : '共享目录'}</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="flex min-w-0 flex-1 items-start gap-2 rounded-lg border border-border bg-input p-3">
              <FolderOpen className="h-4 w-4 shrink-0 text-accent" /><span className="break-all font-mono text-xs leading-relaxed text-text-muted">{root}</span>
            </p>
            <button type="button" className={`${sharedButtonClass} shrink-0 py-2`} disabled={busy} onClick={onChooseWorkspace}>{mode === 'cloud' ? '选择本机同步目录…' : '选择共享目录…'}</button>
          </div>
          <p className="text-xs text-text-muted">{mode === 'cloud' ? '此文件夹位于当前电脑，用于接收云端文件和同步已授权的修改。' : '同步所选共享目录，已授权设备按资料库权限访问文件。'}当前工作区不受影响。</p>
        </div> : <SharedWorkspaceBinding cloud={mode === 'cloud'} key={`${space.id}:${root}`} root={root} spaceId={space.id} busy={busy || owner.state.loading}
          boundSpaceName={blocked ? boundSpace?.name || "其他资料库" : undefined}
          onBind={(id, selectedRoot, confirmed) => owner.bind(id, selectedRoot, confirmed)} onChooseWorkspace={onChooseWorkspace} />}
      </div>
    </section>
  </div>
}

function DetailHeader({ owner, space, current, cloud }: { owner: SharedWorkspaceStateOwner; space: SharedSpace | undefined; current: boolean; cloud: boolean }) {
  const state = owner.state
  return <div className="flex items-center gap-3 p-5 sm:p-6">
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Folder className="h-6 w-6" /></div>
    <div className="min-w-0 flex-1">
      <h2 className="break-words text-lg font-semibold">{space?.name || "资料库详情"}</h2>
      <p className="mt-1 text-xs text-text-muted">{current ? state.loading ? "正在读取资料库概览…" : `${state.files.length} 个文件 · ${state.members.length} 台授权设备`
        : cloud ? "先管理云端共享源目录，需要同步到本机时再选择本机目录" : "选择本地目录，确认后开始共享"}</p>
      {space?.hostName ? <p className="mt-1 text-xs text-text-muted">由 {space.hostName} 发布{space.reachable === false ? "，设备暂不可达；本地副本和待同步修改保留" : ""}</p> : null}
    </div>
    {space ? <span className="shrink-0 rounded-md border border-accent/20 bg-accent/10 px-2 py-1 text-xs text-accent">{sharedSpaceRole(space.role)}</span> : null}
  </div>
}
