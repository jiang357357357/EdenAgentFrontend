import { SharedWorkspaceNetwork } from '../../components/shared-workspace/SharedWorkspaceNetwork'
import { SharedWorkspaceDevices } from '../../components/shared-workspace/SharedWorkspaceDevices'
import { hostsInMode } from '../../components/shared-workspace/shared-workspace-mode'
import type { SharedWorkspaceStateOwner } from '../../components/shared-workspace/shared-workspace-state'

export function SharedWorkspaceConnections({ owner, busy }: {
  owner: SharedWorkspaceStateOwner; busy: boolean
}) {
  const { state } = owner
  const selected = hostsInMode(state.hosts, 'lan').find(host => host.deviceId === state.managementHostId)
  return <div className="space-y-5">
    <SharedWorkspaceNetwork mode="lan" owner={owner} busy={busy || state.loading} />
    {selected?.canManage ? <SharedWorkspaceDevices key={selected.deviceId} devices={state.devices}
      currentDeviceId={state.network?.deviceId} busy={busy || state.loading} expanded onRevoke={id => void owner.revokeDevice(id)} /> : null}
  </div>
}
