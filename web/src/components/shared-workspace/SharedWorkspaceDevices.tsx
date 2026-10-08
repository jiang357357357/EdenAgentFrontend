import { useState } from "react"
import { Monitor, MonitorSmartphone } from "lucide-react"
import type { SharedDevice } from "../../lib/shared-workspace-client"
import { sharedButtonClass } from "./shared-workspace-view"

export function SharedWorkspaceDevices({ devices, busy, expanded = false, onRevoke }: {
  devices: SharedDevice[]
  busy: boolean
  expanded?: boolean
  onRevoke(deviceId: string): void
}) {
  const [confirmId, setConfirmId] = useState("")
  return <details open={expanded} className="rounded-xl border border-border/70 bg-library-card p-4 text-sm sm:p-5">
    <summary className="cursor-pointer font-medium">
      <span className="ml-1 inline-flex items-center gap-2"><MonitorSmartphone className="h-4 w-4 text-accent" />本机与已配对设备<span className="text-xs tabular-nums text-text-muted">({devices.length})</span></span>
    </summary>
    <p className="mt-3 text-xs leading-relaxed text-text-muted">撤销配对会移除此设备对本机资料库的权限，并停止从该设备同步资料。</p>
    {devices.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-border p-5 text-center text-text-muted">暂无设备记录。</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {devices.map(device => <div key={device.deviceId} className="min-w-0 space-y-3 rounded-lg border border-border/60 bg-bg/30 p-3">
        <div className="flex items-start gap-2.5">
          <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
          <div className="min-w-0 flex-1">
            <p className="break-words font-medium">{device.name}</p>
            <p className={`mt-1 text-xs ${device.revoked ? "text-text-muted" : "text-info"}`}>{device.local ? "本机" : device.revoked ? "已撤销" : "已配对"}</p>
          </div>
        </div>
        <p className="break-all font-mono text-xs text-text-muted">{device.deviceId}</p>
        {!device.revoked && !device.local ? <button type="button" className={sharedButtonClass} disabled={busy} onClick={() => setConfirmId(device.deviceId)}>撤销配对</button> : null}
        {confirmId === device.deviceId && !device.revoked ? <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs">确认撤销此设备？</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={sharedButtonClass} disabled={busy} onClick={() => { onRevoke(device.deviceId); setConfirmId(""); }}>确认撤销</button>
            <button type="button" className={sharedButtonClass} disabled={busy} onClick={() => setConfirmId("")}>取消</button>
          </div>
        </div> : null}
      </div>)}
    </div>}
  </details>
}
