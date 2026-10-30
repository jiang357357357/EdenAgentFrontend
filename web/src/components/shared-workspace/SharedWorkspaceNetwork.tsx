import { useState } from "react"
import { Link, Monitor, Radio } from "lucide-react"
import type { SharedWorkspaceStateOwner } from "./shared-workspace-state"
import { sharedButtonClass, sharedInputClass, sharedPrimaryButtonClass } from "./shared-workspace-view"
import { hostsInMode, type SharedWorkspaceMode } from './shared-workspace-mode'

export function SharedWorkspaceNetwork({ owner, busy, mode = 'lan', showConnect = true }: {
  owner: SharedWorkspaceStateOwner; busy: boolean; mode?: SharedWorkspaceMode; showConnect?: boolean
}) {
  const [code, setCode] = useState("")
  const [address, setAddress] = useState("")
  const network = owner.state.network
  const hosts = hostsInMode(owner.state.hosts, mode)
  const host = hosts.find(value => value.deviceId === owner.state.managementHostId)
  const invitation = host ? owner.state.invitation : null
  const lan = mode === 'lan'
  const canInvite = host?.reachable && host.canManage && (host.local || owner.state.status?.canPublish)
  const pair = async () => {
    const result = lan ? await owner.pairDevice(code, address || undefined) : await owner.connectHost(code, address || undefined)
    if (result) { setCode(""); setAddress("") }
  }
  return <section className="space-y-5 rounded-xl border border-border/70 bg-library-card p-5 sm:p-6" aria-label="共享主机连接">
    <div><h2 className="flex items-center gap-2 text-base font-semibold"><Radio className="h-5 w-5 text-accent" />{lan ? '局域网设备与配对' : '云主机连接与管理'}</h2>
      <p className="mt-2 text-sm text-text-muted">{lan ? '发现同一局域网中的电脑，使用设备邀请配对，再由资料库发布方授权。' : '使用云主机地址和邀请连接，管理员可管理云端设备与资料库权限。'}</p></div>
    {!network ? <p className="text-sm text-text-muted">正在读取本机共享服务…</p> : <>
      {lan ? <div className="space-y-2 rounded-lg border border-border bg-bg/30 p-3 text-sm">
        <p className="flex items-center gap-2"><Monitor className="h-4 w-4 text-accent" />{network.name}<span className="text-xs text-text-muted">本机 · {network.listening ? "共享服务已启动" : "共享服务已关闭"}</span></p>
        {network.addresses.map(value => <p key={value} className="break-all font-mono text-xs text-text-muted">{value}</p>)}
        {!network.addresses.length ? <p className="text-xs text-warning">未找到局域网 IPv4 地址，请检查网络连接。</p> : null}
      </div> : null}
      {lan && network.discoveryError ? <p role="status" className="text-xs text-warning">{network.discoveryError}</p> : null}
      {hosts.length ? <label className="block space-y-2 text-sm"><span>{lan ? '管理局域网主机' : '管理云主机'}</span>
        <select aria-label="管理主机" className={sharedInputClass} disabled={busy} value={host?.deviceId ?? ''} onChange={event => void owner.selectHost(event.target.value)}>
          {!host ? <option value="" disabled>请选择主机</option> : null}
          {hosts.map(value => <option key={value.deviceId} value={value.deviceId}>{value.name}{value.local ? '（本机）' : lan ? '（局域网电脑）' : '（云主机）'}{value.reachable ? '' : ' · 离线'}</option>)}
        </select></label>
        : <p className="text-sm text-text-muted">{lan ? '尚未发现可管理的局域网主机。' : '尚未连接云主机。'}</p>}
      {host && !host.local ? <div className="space-y-1 text-xs text-text-muted">{host.addresses.map(value => <p className="break-all font-mono" key={value}>{value}</p>)}
        {!host.canManage ? <p>当前子机没有此主机的管理权限，请联系其管理员创建邀请和授权。</p> : null}
        {host.error ? <p className="text-warning">{host.error}</p> : null}</div> : null}
      {network.peers.filter(peer => peer.paired && peer.error && hosts.some(value => value.deviceId === peer.deviceId)).map(peer => <p key={peer.deviceId} role="status" className="break-words text-xs text-warning">{peer.name}：{peer.error}</p>)}
      {host ? <div className="space-y-3">
        <button type="button" className={`${sharedButtonClass} inline-flex items-center gap-2`} disabled={busy || !canInvite} onClick={() => void owner.invitePairing()}><Link className="h-4 w-4" />为所选主机创建邀请</button>
        {invitation ? <div className="space-y-2">
          <label className="block space-y-2 text-sm"><span>将此邀请交给要配对的电脑</span>
            <textarea aria-label={lan ? '本机配对邀请' : '云主机配对邀请'} className={`${sharedInputClass} min-h-24 resize-y font-mono text-xs`} readOnly value={Date.now() < invitation.expiresAt ? invitation.code : "邀请已过期，请重新创建。"} onFocus={event => event.target.select()} /></label>
          <p className="text-xs text-text-muted">{new Date(invitation.expiresAt).toLocaleTimeString()} 到期，仅用于一次设备配对，不自动共享文件。</p>
        </div> : null}
      </div> : null}
      {showConnect ? <form className="space-y-3 border-t border-border pt-5" onSubmit={event => { event.preventDefault(); void pair() }}>
        <label className="block space-y-2 text-sm"><span>{lan ? '输入局域网配对邀请' : '输入云主机配对邀请'}</span><textarea aria-label="对方配对邀请" value={code} disabled={busy} maxLength={4096}
          onChange={event => setCode(event.target.value)} className={`${sharedInputClass} min-h-20 resize-y font-mono text-xs`} placeholder="粘贴对方生成的 eden-lan2: 配对邀请" /></label>
        <label className="block space-y-2 text-sm text-text-muted"><span>{lan ? '局域网 IP 或地址（可选）' : '云主机 IP 或地址（可选）'}</span><input aria-label="配对设备地址" value={address} disabled={busy}
          onChange={event => setAddress(event.target.value)} className={sharedInputClass} placeholder={lan ? '例如 192.168.1.10:40195' : '203.0.113.10:40195 或 https://共享主机域名'} /></label>
        <button type="submit" className={sharedPrimaryButtonClass} disabled={busy || !code.trim() || !network.listening}>{lan ? '配对局域网设备' : '连接云主机'}</button>
      </form> : null}
      {lan && network.peers.filter(peer => !peer.paired && peer.discovered && !peer.revoked).length ? <div className="space-y-2 border-t border-border pt-4">
        <h3 className="text-sm font-medium">局域网中发现的设备</h3>
        {network.peers.filter(peer => !peer.paired && peer.discovered && !peer.revoked).map(peer => <div key={peer.deviceId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
          <span>{peer.name}<span className="ml-2 text-xs text-text-muted">待配对</span></span>
          <button type="button" className={sharedButtonClass} disabled={busy} onClick={() => setAddress(peer.addresses[0] || "")}>使用此地址</button>
        </div>)}
        <p className="text-xs text-text-muted">请在对方电脑创建邀请，并粘贴到上方。发现设备不会自动建立信任。</p>
      </div> : null}
    </>}
  </section>
}
