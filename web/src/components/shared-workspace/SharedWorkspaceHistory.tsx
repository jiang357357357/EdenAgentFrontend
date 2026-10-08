import { useId, useState } from "react"
import type { SharedFile, SharedVersion } from "../../lib/shared-workspace-client"
import { sharedButtonClass, sharedInputClass } from "./shared-workspace-view"

export function SharedWorkspaceHistory({ files, versions, fileId, loading, busy, canWrite, onSelect, onRestore }: {
  files: SharedFile[]
  versions: SharedVersion[]
  fileId: string
  loading: boolean
  busy: boolean
  canWrite: boolean
  onSelect(fileId: string): void
  onRestore(fileId: string, revision: number): void
}) {
  const id = useId()
  const [selected, setSelected] = useState<{ fileId: string; revision: number } | null>(null)
  return <section aria-label="历史版本" className="space-y-3">
    <label className="block space-y-1 text-sm" htmlFor={id}>
      <span>选择文件</span>
      <select id={id} className={sharedInputClass} value={fileId} disabled={busy}
        onChange={event => { setSelected(null); onSelect(event.target.value) }}>
        <option value="">请选择要查看历史的文件</option>
        {files.map(file => <option key={file.fileId} value={file.fileId}>{file.path}{file.deleted ? "（已删除）" : ""}</option>)}
      </select>
    </label>
    {fileId ? <button type="button" className={sharedButtonClass} disabled={busy || loading} onClick={() => onSelect(fileId)}>刷新历史</button> : null}
    {files.length === 0 ? <p className="text-sm text-text-muted">同步后，可在这里选择文件查看版本。</p> : null}
    {loading ? <p role="status" className="text-sm text-text-muted">正在读取历史版本…</p> : versions.map(version =>
      <article key={version.revision} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
        <span>版本 {version.revision} · {version.deleted ? "删除记录" : `${version.size} 字节`}</span>
        <button type="button" className={sharedButtonClass} disabled={busy || !canWrite}
          onClick={() => setSelected({ fileId, revision: version.revision })}>恢复此版本</button>
      </article>)}
    {selected && selected.fileId === fileId ? <div className="space-y-2 rounded-lg border border-border bg-bg/60 p-3 text-sm">
      <p>确认恢复版本 {selected.revision}？此操作会生成新版本；当前本地文件会先保留备份。恢复删除记录会删除当前文件。</p>
      <div className="flex gap-2">
        <button type="button" className={sharedButtonClass} disabled={busy || !canWrite} onClick={() => { onRestore(selected.fileId, selected.revision); setSelected(null) }}>确认恢复</button>
        <button type="button" className={sharedButtonClass} disabled={busy} onClick={() => setSelected(null)}>取消</button>
      </div>
    </div> : null}
    {!canWrite ? <p className="text-xs text-text-muted">只读成员可以查看历史，恢复需要编辑权限。</p> : null}
  </section>
}
