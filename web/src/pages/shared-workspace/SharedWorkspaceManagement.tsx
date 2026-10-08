import { SharedWorkspaceConflicts } from "../../components/shared-workspace/SharedWorkspaceConflicts"
import { SharedWorkspaceHistory } from "../../components/shared-workspace/SharedWorkspaceHistory"
import { SharedWorkspaceMembers } from "../../components/shared-workspace/SharedWorkspaceMembers"
import type { SharedWorkspaceStateOwner } from "../../components/shared-workspace/shared-workspace-state"

export type SharedWorkspaceManagementSection = "conflicts" | "history" | "members"
const labels = { conflicts: "冲突处理", history: "文件历史", members: "共享权限" }

export function SharedWorkspaceManagement({ owner, busy, section }: {
  owner: SharedWorkspaceStateOwner
  busy: boolean
  section: SharedWorkspaceManagementSection
}) {
  const state = owner.state
  const space = state.spaces.find(item => item.id === state.status?.spaceId)
  const canWrite = space?.role === "owner" || space?.role === "editor"
  return <section className="rounded-xl border border-border/70 bg-library-card p-5 sm:p-6" aria-label={labels[section]}>
    <h2 className="mb-5 text-base font-semibold">{labels[section]}</h2>
    {section === "conflicts" ? <SharedWorkspaceConflicts conflicts={state.conflicts} busy={busy} canWrite={canWrite}
      onResolve={(conflictId, strategy) => void owner.resolve(conflictId, strategy)} /> : null}
    {section === "history" ? <SharedWorkspaceHistory files={state.files} versions={state.history} fileId={state.historyFileId}
      loading={state.historyLoading} busy={busy} canWrite={canWrite} onSelect={fileId => void owner.loadHistory(fileId)}
      onRestore={(fileId, revision) => void owner.restore(fileId, revision)} /> : null}
    {section === "members" ? <SharedWorkspaceMembers members={state.members} devices={state.devices} busy={busy} canManage={space?.role === "owner"}
      onSet={(deviceId, role) => void owner.setMember(deviceId, role)} onRemove={deviceId => void owner.removeMember(deviceId)} /> : null}
  </section>
}
