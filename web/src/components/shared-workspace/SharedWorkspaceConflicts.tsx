import type { SharedConflict } from "../../lib/shared-workspace-client"
import { sharedButtonClass } from "./shared-workspace-view"

export function SharedWorkspaceConflicts({ conflicts, busy, canWrite, onResolve }: {
  conflicts: SharedConflict[]
  busy: boolean
  canWrite: boolean
  onResolve(id: string, strategy: "local" | "remote"): void
}) {
  return <section aria-label="文件冲突" className="space-y-3">
    <p className="text-sm text-text-muted">冲突不会自动覆盖。采用远端前，同步服务会保留本地版本备份；保留本地会提交一个新版本。</p>
    {conflicts.length === 0 ? <p className="text-sm text-text-muted">当前没有待处理冲突。</p> : conflicts.map(conflict =>
      <article key={conflict.id} className="space-y-2 rounded-xl border border-border p-3">
        <p className="break-all text-sm font-medium">{conflict.path}</p>
        <p className="text-xs text-text-muted">本地：{conflict.local.deleted ? "已删除" : `${conflict.local.size} 字节`}
          {" · "}远端：{!conflict.remote || conflict.remote.deleted ? "已删除" : `版本 ${conflict.remote.revision} · ${conflict.remote.size} 字节`}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={sharedButtonClass} disabled={busy || !canWrite} onClick={() => onResolve(conflict.id, "local")}>保留本地版本</button>
          <button type="button" className={sharedButtonClass} disabled={busy} onClick={() => onResolve(conflict.id, "remote")}>采用远端并保留本地备份</button>
        </div>
        {!canWrite ? <p className="text-xs text-text-muted">当前权限只允许采用远端版本。</p> : null}
      </article>)}
  </section>
}
