import { Pause, Play, RefreshCw } from "lucide-react"
import type { SharedWorkspaceStateOwner } from "../../components/shared-workspace/shared-workspace-state"
import { sharedButtonClass, sharedPrimaryButtonClass, sharedTimestamp, sharedWorkspaceLabel } from "../../components/shared-workspace/shared-workspace-view"

export function SharedWorkspaceSync({ owner, busy }: { owner: SharedWorkspaceStateOwner; busy: boolean }) {
  const status = owner.state.status
  if (!status?.bound) return null
  const attention = status.paused || status.conflicts > 0 || Boolean(status.error) || status.state === "offline"
  return <section className="rounded-xl border border-border/70 bg-library-card p-5 sm:p-6" aria-label="同步状态">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold">同步状态</h2>
        <p role="status" className={`mt-2 inline-flex items-center gap-2 text-sm ${attention ? "text-warning" : "text-success"}`}>
          <span className="h-2 w-2 rounded-full bg-current" />{sharedWorkspaceLabel(status)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${sharedPrimaryButtonClass} inline-flex items-center gap-2`} disabled={busy || status.paused || status.state === "syncing"} onClick={() => void owner.sync()}>
          <RefreshCw className={`h-4 w-4 ${status.state === "syncing" ? "animate-spin" : ""}`} />立即同步
        </button>
        <button type="button" className={`${sharedButtonClass} inline-flex items-center gap-2`} disabled={busy} onClick={() => void owner.pause(!status.paused)}>
          {status.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{status.paused ? "恢复自动同步" : "暂停自动同步"}
        </button>
      </div>
    </div>
    <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-3">
      <div><dt className="text-xs text-text-muted">待同步</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{status.pending}<span className="ml-1 text-xs font-normal text-text-muted">项</span></dd></div>
      <div><dt className="text-xs text-text-muted">待处理冲突</dt><dd className={`mt-1 text-2xl font-semibold tabular-nums ${status.conflicts ? "text-warning" : ""}`}>{status.conflicts}<span className="ml-1 text-xs font-normal text-text-muted">项</span></dd></div>
      <div className="col-span-2 sm:col-span-1"><dt className="text-xs text-text-muted">上次同步</dt><dd className="mt-2 text-sm">{sharedTimestamp(status.lastSync)}</dd></div>
    </dl>
    {status.error ? <p role="alert" className="mt-4 break-words rounded-lg bg-danger/10 p-3 text-sm text-danger">{status.error}</p> : null}
  </section>
}
