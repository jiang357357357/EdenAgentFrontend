import type { SharedHost, SharedSpace } from '../../lib/shared-workspace-client'

export type SharedWorkspaceMode = 'lan' | 'cloud'
export const sharedModeLabels = { lan: '局域网共享', cloud: '云主机共享' } as const

export function hostsInMode(hosts: SharedHost[], mode: SharedWorkspaceMode): SharedHost[] {
  return hosts.filter(host => mode === 'cloud' ? !host.local && host.dedicated : host.local || !host.dedicated)
}

export function spacesInMode(spaces: SharedSpace[], hosts: SharedHost[], mode: SharedWorkspaceMode): SharedSpace[] {
  const cloudIds = new Set(hosts.filter(host => !host.local && host.dedicated).map(host => host.deviceId))
  return spaces.filter(space => cloudIds.has(space.hostDeviceId ?? '') === (mode === 'cloud'))
}
