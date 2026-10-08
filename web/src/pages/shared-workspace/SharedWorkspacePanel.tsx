import { NoticeCard } from "../../components/feedback"
import { SharedWorkspaceDevices } from "../../components/shared-workspace/SharedWorkspaceDevices"
import { SharedWorkspaceNetwork } from "../../components/shared-workspace/SharedWorkspaceNetwork"
import type { SharedWorkspaceStateOwner } from "../../components/shared-workspace/shared-workspace-state"
import { sharedButtonClass } from "../../components/shared-workspace/shared-workspace-view"
import type { SharedSpace } from "../../lib/shared-workspace-client"
import { SharedWorkspaceDetail } from "./SharedWorkspaceDetail"
import { SharedWorkspaceLibraries } from "./SharedWorkspaceLibraries"
import { SharedWorkspaceManagement } from "./SharedWorkspaceManagement"
import { sharedWorkspaceSections, type SharedWorkspaceSection } from "./SharedWorkspaceNavigation"
import { SharedWorkspaceSync } from "./SharedWorkspaceSync"

export function SharedWorkspacePanel({ section, owner, selected, root, busy, onSelect, onChooseWorkspace, onShowLibraries }: {
  section: SharedWorkspaceSection
  owner: SharedWorkspaceStateOwner
  selected?: SharedSpace
  root: string
  busy: boolean
  onSelect(id: string): void
  onChooseWorkspace(): void
  onShowLibraries(): void
}) {
  const state = owner.state
  const status = state.status
  if (!status) return null
  if (section === "libraries") return <div className="grid items-start gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
    <SharedWorkspaceLibraries spaces={state.spaces} selectedId={selected?.id || ""} boundId={status.spaceId}
      busy={busy || state.loading} canPublish={status.canPublish} onSelect={onSelect} onCreate={name => owner.create(name)} />
    <div className="min-w-0 space-y-5">
      {status.canPublish === false ? <NoticeCard tone="neutral" title="可接收其他电脑的共享资料"
        description="接收方无需共享资料库 DLC。配对发布电脑并获得授权后，选择资料库和本地目录即可同步；只有发布本机目录才需要启用 DLC。" /> : null}
      <SharedWorkspaceDetail owner={owner} space={selected} busy={busy} root={root} onChooseWorkspace={onChooseWorkspace} />
    </div>
  </div>
  if (section === "network") return <div className="space-y-5">
    <SharedWorkspaceNetwork owner={owner} busy={busy || state.loading} />
    <SharedWorkspaceDevices devices={state.devices} busy={busy} expanded onRevoke={id => void owner.revokeDevice(id)} />
  </div>
  const current = Boolean(selected && status.bound && status.spaceId === selected.id)
  if (!current) return <section className="rounded-xl border border-border/70 bg-library-card p-6">
    <h2 className="text-base font-semibold">{sharedWorkspaceSections.find(item => item.id === section)?.label}</h2>
    <p className="my-4 text-sm text-text-muted">{selected ? "先在资料库中为所选资料库绑定本地目录，再管理同步、冲突、历史和权限。" : "先选择资料库并绑定本地目录，再使用此功能。"}</p>
    <button type="button" className={sharedButtonClass} onClick={onShowLibraries}>前往资料库</button>
  </section>
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-library-card px-5 py-4">
      <p className="min-w-0 break-words text-sm">当前资料库：<strong>{selected?.name}</strong></p>
      <button type="button" className={sharedButtonClass} onClick={onShowLibraries}>切换资料库</button>
    </div>
    {section === "sync" ? <SharedWorkspaceSync owner={owner} busy={busy} />
      : <SharedWorkspaceManagement owner={owner} busy={busy} section={section} />}
  </div>
}
