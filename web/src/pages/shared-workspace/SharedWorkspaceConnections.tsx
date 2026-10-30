import { useEffect, useState } from 'react'
import { Cloud, CloudUpload, Link } from 'lucide-react'
import { SharedHostDeployment } from '../../components/shared-workspace/SharedHostDeployment'
import { SharedWorkspaceNetwork } from '../../components/shared-workspace/SharedWorkspaceNetwork'
import { SharedWorkspaceDevices } from '../../components/shared-workspace/SharedWorkspaceDevices'
import { hostsInMode, type SharedWorkspaceMode } from '../../components/shared-workspace/shared-workspace-mode'
import type { SharedWorkspaceStateOwner } from '../../components/shared-workspace/shared-workspace-state'

export function SharedWorkspaceConnections({ mode, owner, busy }: {
  mode: SharedWorkspaceMode; owner: SharedWorkspaceStateOwner; busy: boolean
}) {
  const [action, setAction] = useState<'connect' | 'deploy'>(() => owner.state.deployment?.state === 'running' ? 'deploy' : 'connect')
  const { state } = owner
  const hosts = hostsInMode(state.hosts, mode)
  const selected = hosts.find(host => host.deviceId === state.managementHostId)
  useEffect(() => {
    if (state.deployment?.state === 'running') setAction('deploy')
  }, [state.deployment?.id, state.deployment?.state])
  return <div className="space-y-5">
    {mode === 'cloud' ? <section aria-label="云主机连接方式" className="border-b border-border pb-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Cloud className="h-5 w-5 text-accent" />云主机共享</h2>
      <div role="group" aria-label="云主机操作" className="flex flex-wrap gap-2">
        {(['connect', 'deploy'] as const).map(value => {
          const Icon = value === 'connect' ? Link : CloudUpload
          return <button key={value} type="button" aria-pressed={action === value} disabled={busy || (value === 'deploy' && !state.status?.canPublish)}
            onClick={() => setAction(value)} className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50 ${action === value
              ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border text-text-muted hover:bg-library-card'}`}>
            <Icon className="h-4 w-4" />{value === 'connect' ? '连接已有云主机' : '部署新云主机'}
          </button>
        })}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-text-muted">{action === 'connect'
        ? '已有主机地址和管理员邀请时，可直接连接，接收资料无需 DLC。'
        : '填写 SSH 信息，自动安装运行环境并部署；需要启用共享资料库 DLC。'}</p>
    </section> : null}
    {mode === 'lan' || action === 'connect' ? <SharedWorkspaceNetwork mode={mode} owner={owner} busy={busy || state.loading} /> : null}
    {mode === 'cloud' && action === 'deploy' && state.status?.canPublish ? <SharedHostDeployment owner={owner} busy={busy} /> : null}
    {selected?.canManage && (mode === 'lan' || action === 'connect') ? <SharedWorkspaceDevices key={selected.deviceId} devices={state.devices} currentDeviceId={state.network?.deviceId}
      busy={busy || state.loading} expanded onRevoke={id => void owner.revokeDevice(id)} /> : null}
  </div>
}
