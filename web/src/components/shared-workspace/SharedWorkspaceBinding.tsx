import { useId, useState } from "react"
import { Check, FolderOpen, UsersRound } from "lucide-react"
import { sharedButtonClass, sharedPrimaryButtonClass } from "./shared-workspace-view"

export function SharedWorkspaceBinding({ root, spaceId, busy, boundSpaceName, onBind, onChooseWorkspace }: {
  root: string
  spaceId: string
  busy: boolean
  boundSpaceName?: string
  onBind(spaceId: string, selectedRoot: string, confirmed: boolean): Promise<void>
  onChooseWorkspace(): void
}) {
  const id = useId()
  const [selectedRoot, setSelectedRoot] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const directorySelected = Boolean(root) && selectedRoot === root
  const blocked = Boolean(boundSpaceName)
  const canBind = !busy && !!spaceId && directorySelected && confirmed && !blocked
  return <section className="space-y-5" aria-label="绑定共享目录">
    <div>
      <h3 className="text-sm font-semibold">绑定本地目录</h3>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">选择要共享的本地文件夹，确认后将共享给资料库成员。</p>
    </div>
    {blocked ? <p role="status" className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm leading-relaxed text-warning">
      当前共享目录已绑定“{boundSpaceName}”。请另选共享目录后，再绑定所选资料库。
    </p> : null}
    <div className="space-y-3">
      <p className="text-xs text-text-muted">独立共享目录</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className={`flex min-w-0 flex-1 items-start gap-2 rounded-lg border bg-input p-3 ${directorySelected ? "border-accent/60" : "border-border"}`}>
          <FolderOpen className="h-4 w-4 shrink-0 text-accent" />
          <span className="break-all font-mono text-xs leading-relaxed text-text-muted">{root || "尚未选择目录"}</span>
        </p>
        <button type="button" className={`${sharedButtonClass} shrink-0 border-accent/30 py-2 text-accent`} disabled={busy} onClick={onChooseWorkspace}>选择共享目录…</button>
      </div>
      <button type="button" className={`${sharedButtonClass} inline-flex items-center gap-2 ${directorySelected ? "border-accent text-accent" : ""}`}
        disabled={busy || !root || !spaceId || blocked} aria-pressed={directorySelected}
        onClick={() => { setSelectedRoot(root); setConfirmed(false) }}>{directorySelected ? <Check className="h-4 w-4" /> : null}确认使用此共享目录</button>
    </div>
    <div className="rounded-lg border border-border/60 bg-accent/5 p-4">
      <p className="flex items-center gap-2 text-sm font-medium"><FolderOpen className="h-4 w-4 text-accent" />共享整个所选文件夹</p>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">共享目录独立于当前工作区。只想共享一个子文件夹时，请直接选择该文件夹；当前工作区不会改变。</p>
      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-text-muted"><UsersRound className="h-4 w-4 shrink-0" />可同步的文件将共享给资料库成员，远端文件也会同步到本机。</p>
    </div>
    <form className="flex flex-col gap-4 border-t border-border/70 pt-5 sm:flex-row sm:items-center" onSubmit={event => {
      event.preventDefault()
      if (canBind) void onBind(spaceId, selectedRoot, confirmed)
    }}>
      <label htmlFor={id} className="flex min-w-0 flex-1 items-start gap-2.5 text-sm leading-relaxed">
        <input id={id} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-accent" checked={confirmed}
          disabled={busy || !root || !spaceId || blocked}
          onChange={event => { setSelectedRoot(root); setConfirmed(event.target.checked) }} />
        <span>我确认将所选目录共享给资料库成员，其中不应包含不希望共享的资料。</span>
      </label>
      <button type="submit" className={`${sharedPrimaryButtonClass} shrink-0`}
        disabled={!canBind}>绑定并共享此目录</button>
    </form>
  </section>
}
