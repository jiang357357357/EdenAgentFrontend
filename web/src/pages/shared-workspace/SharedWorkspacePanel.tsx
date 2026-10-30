import { NoticeCard } from "../../components/feedback"
import { hostsInMode, spacesInMode, type SharedWorkspaceMode } from "../../components/shared-workspace/shared-workspace-mode"
import type { SharedWorkspaceStateOwner } from "../../components/shared-workspace/shared-workspace-state"
import { sharedButtonClass } from "../../components/shared-workspace/shared-workspace-view"
import type { SharedSpace } from "../../lib/shared-workspace-client"
import { SharedWorkspaceDetail } from "./SharedWorkspaceDetail"
import { SharedWorkspaceLibraries } from "./SharedWorkspaceLibraries"
import { SharedWorkspaceManagement } from "./SharedWorkspaceManagement"
import { sharedWorkspaceSections, type SharedWorkspaceSection } from "./SharedWorkspaceNavigation"
import { SharedWorkspaceSync } from "./SharedWorkspaceSync"
import { SharedWorkspaceConnections } from './SharedWorkspaceConnections'
import { CloudMembersPanel } from '../../components/shared-workspace/CloudMembersPanel'
import { CloudLibraries } from './CloudLibraries'

export function SharedWorkspacePanel({ mode = 'lan', section, owner, selected: selection, root, busy, onSelect, onChooseWorkspace, onShowLibraries, onManageHost }: {
  mode?: SharedWorkspaceMode
  section: SharedWorkspaceSection
  owner: SharedWorkspaceStateOwner
  selected?: SharedSpace
  root: string
  busy: boolean
  onSelect(id: string): void
  onChooseWorkspace(): void
  onShowLibraries(): void
  onManageHost?(): void
}) {
  const state = owner.state
  const status = state.status
  const spaces = spacesInMode(state.spaces, state.hosts, mode)
  const hosts = hostsInMode(state.hosts, mode)
  const selected = spaces.find(space => space.id === selection?.id)
  if (!status) return null
  if (section === 'libraries' && mode === 'cloud') return <CloudLibraries owner={owner} selected={selected} root={root} busy={busy}
    onSelect={onSelect} onChooseWorkspace={onChooseWorkspace} onManageHost={onManageHost ?? onShowLibraries} />
  if (section === "libraries") return <div className="grid items-start gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
    <SharedWorkspaceLibraries spaces={spaces} selectedId={selected?.id || ""} boundId={status.spaceId}
      busy={busy || state.loading} canPublish={status.canPublish} hosts={hosts} onSelect={onSelect} onCreate={(name, hostId) => owner.create(name, hostId)} />
    <div className="min-w-0 space-y-5">
      {status.error && !status.bound ? <NoticeCard tone="neutral" title="请核对当前姿态的同步目录" description={status.error} /> : null}
      {status.canPublish === false ? <NoticeCard tone="neutral" title="可接收其他电脑的共享资料"
        description="接收方无需共享资料库 DLC。配对发布电脑并获得授权后，选择资料库和本地目录即可同步；只有发布本机目录才需要启用 DLC。" /> : null}
      <SharedWorkspaceDetail mode={mode} owner={owner} space={selected} busy={busy} root={root} onChooseWorkspace={onChooseWorkspace} />
    </div>
  </div>
  if (section === "network") return <SharedWorkspaceConnections mode={mode} owner={owner} busy={busy} />
  if (mode === 'cloud' && section === 'members' && selected && hosts.some(host => host.deviceId === selected.hostDeviceId && host.canManage))
    return <CloudMembersPanel key={selected.id} owner={owner} space={selected} busy={busy} />
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
