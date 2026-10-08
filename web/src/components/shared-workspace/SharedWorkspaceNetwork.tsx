import { useState } from "react"
import { Link, Monitor, Radio } from "lucide-react"
import type { SharedWorkspaceStateOwner } from "./shared-workspace-state"
import { sharedButtonClass, sharedInputClass, sharedPrimaryButtonClass } from "./shared-workspace-view"

export function SharedWorkspaceNetwork({ owner, busy }: { owner: SharedWorkspaceStateOwner; busy: boolean }) {
  const [code, setCode] = useState("")
  const [address, setAddress] = useState("")
  const network = owner.state.network
  const invitation = owner.state.invitation
  const pair = async () => { const result = await owner.pairDevice(code, address || undefined); if (result) { setCode(""); setAddress("") } }
  return <section className="space-y-5 rounded-xl border border-border/70 bg-library-card p-5 sm:p-6" aria-label="局域网设备配对">
    <div><h2 className="flex items-center gap-2 text-base font-semibold"><Radio className="h-5 w-5 text-accent" />局域网设备配对</h2>
      <p className="mt-2 text-sm text-text-muted">各电脑保留自己的 Core。先配对设备，再由资料库发布方授予目录访问权限。</p></div>
    {!network ? <p className="text-sm text-text-muted">正在读取本机共享服务…</p> : <>
      <div className="space-y-2 rounded-lg border border-border bg-bg/30 p-3 text-sm">
        <p className="flex items-center gap-2"><Monitor className="h-4 w-4 text-accent" />{network.name}<span className="text-xs text-text-muted">本机 · {network.listening ? "共享服务已启动" : "共享服务已关闭"}</span></p>
        {network.addresses.map(value => <p key={value} className="break-all font-mono text-xs text-text-muted">{value}</p>)}
        {!network.addresses.length ? <p className="text-xs text-warning">未找到局域网 IPv4 地址，请检查网络连接。</p> : null}
      </div>
      {network.discoveryError ? <p role="status" className="text-xs text-warning">{network.discoveryError}</p> : null}
      {network.peers.filter(peer => peer.paired && peer.error).map(peer => <p key={peer.deviceId} role="status" className="break-words text-xs text-warning">{peer.name}：{peer.error}</p>)}
      <div className="space-y-3">
        <button type="button" className={`${sharedButtonClass} inline-flex items-center gap-2`} disabled={busy || !network.listening} onClick={() => void owner.invitePairing()}><Link className="h-4 w-4" />创建配对邀请</button>
        {invitation ? <div className="space-y-2">
          <label className="block space-y-2 text-sm"><span>将此邀请交给要配对的电脑</span>
            <textarea aria-label="本机配对邀请" className={`${sharedInputClass} min-h-24 resize-y font-mono text-xs`} readOnly value={Date.now() < invitation.expiresAt ? invitation.code : "邀请已过期，请重新创建。"} onFocus={event => event.target.select()} /></label>
          <p className="text-xs text-text-muted">{new Date(invitation.expiresAt).toLocaleTimeString()} 到期，仅用于一次设备配对，不自动共享文件。</p>
        </div> : null}
      </div>
      <form className="space-y-3 border-t border-border pt-5" onSubmit={event => { event.preventDefault(); void pair() }}>
        <label className="block space-y-2 text-sm"><span>接受另一台电脑的配对邀请</span><textarea aria-label="对方配对邀请" value={code} disabled={busy} maxLength={4096}
          onChange={event => setCode(event.target.value)} className={`${sharedInputClass} min-h-20 resize-y font-mono text-xs`} placeholder="粘贴对方生成的 eden-lan2: 配对邀请" /></label>
        <label className="block space-y-2 text-sm text-text-muted"><span>对方局域网地址（可选，未填写时使用邀请中的地址）</span><input aria-label="配对设备地址" value={address} disabled={busy}
          onChange={event => setAddress(event.target.value)} className={sharedInputClass} placeholder="http://192.168.1.10:端口" /></label>
        <button type="submit" className={sharedPrimaryButtonClass} disabled={busy || !code.trim() || !network.listening}>确认配对设备</button>
      </form>
      {network.peers.filter(peer => !peer.paired && peer.discovered && !peer.revoked).length ? <div className="space-y-2 border-t border-border pt-4">
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
