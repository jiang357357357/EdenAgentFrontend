import { useId, useState } from "react"
import { Check, Folder, FolderPlus, Plus, Search, X } from "lucide-react"
import type { SharedSpace } from "../../lib/shared-workspace-client"
import { sharedButtonClass, sharedInputClass, sharedPrimaryButtonClass, sharedSpaceRole } from "../../components/shared-workspace/shared-workspace-view"

interface LibrariesProps {
  spaces: SharedSpace[]
  selectedId: string
  boundId: string | null
  busy: boolean
  canPublish?: boolean
  onSelect(id: string): void
  onCreate(name: string): Promise<{ space: SharedSpace } | undefined>
}

export function SharedWorkspaceLibraries({ spaces, selectedId, boundId, busy, canPublish = true, onSelect, onCreate }: LibrariesProps) {
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const id = useId()
  const filtered = spaces.filter(space => space.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const create = async () => {
    const result = await onCreate(name)
    if (result) { setName(""); setQuery(""); setCreating(false); onSelect(result.space.id) }
  }
  return <aside className="flex min-w-0 flex-col rounded-xl border border-border/70 bg-library-card p-4 md:sticky md:top-0 md:max-h-[calc(100vh-13rem)]" aria-label="资料库列表">
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">资料库列表</h2><span className="text-xs tabular-nums text-text-muted">{spaces.length}</span>
    </div>
    <label className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2 focus-within:border-accent">
      <Search className="h-4 w-4 shrink-0 text-text-muted" />
      <input type="search" aria-label="搜索资料库" value={query} disabled={busy} onChange={event => setQuery(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-lighter" placeholder="搜索资料库…" />
    </label>
    <button type="button" className={`${sharedButtonClass} mt-3 flex w-full items-center justify-center gap-2 border-accent/30 py-2 text-accent`}
      disabled={busy || !canPublish} title={!canPublish ? "发布资料库需要启用共享资料库 DLC" : undefined} aria-expanded={canPublish && creating} aria-controls={`${id}-create`} onClick={() => setCreating(value => !value)}>
      <Plus className="h-4 w-4" />新建资料库
    </button>
    {canPublish && creating ? <form id={`${id}-create`} className="mt-3 space-y-3 rounded-lg border border-border bg-bg/40 p-3" onSubmit={event => { event.preventDefault(); void create() }}>
      <label htmlFor={`${id}-name`} className="block space-y-1 text-xs text-text-muted">
        <span>新资料库名称</span><input id={`${id}-name`} value={name} maxLength={120} disabled={busy}
          onChange={event => setName(event.target.value)} className={sharedInputClass} placeholder="例如：项目资料" autoFocus />
      </label>
      <div className="flex gap-2">
        <button type="submit" className={`${sharedPrimaryButtonClass} flex-1`} disabled={busy || !name.trim()}>创建</button>
        <button type="button" className={sharedButtonClass} disabled={busy} onClick={() => setCreating(false)} aria-label="取消新建资料库"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-xs leading-relaxed text-text-muted">创建资料库本身不会上传文件。</p>
    </form> : null}
    <nav className="mt-4 min-h-0 space-y-2 md:overflow-y-auto" aria-label="选择资料库">
      {filtered.map(space => <button key={space.id} type="button" aria-label={`选择资料库：${space.name}`} aria-pressed={selectedId === space.id}
        disabled={busy} onClick={() => onSelect(space.id)}
        className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition disabled:opacity-40 ${selectedId === space.id ? "border-accent/70 bg-accent/15" : "border-transparent hover:border-border hover:bg-surface-hover"}`}>
        <Folder className={`mt-0.5 h-5 w-5 shrink-0 ${selectedId === space.id ? "text-accent" : "text-text-muted"}`} />
        <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{space.name}</span>
          <span className="mt-1 block text-xs text-text-muted">{sharedSpaceRole(space.role)}{boundId === space.id ? " · 当前目录已绑定" : ""}</span>
          {space.hostName ? <span className="mt-1 block break-words text-xs text-text-muted">{space.hostName} 发布{space.reachable === false ? " · 暂不可达" : ""}</span> : null}</span>
        {selectedId === space.id ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> : null}
      </button>)}
      {filtered.length === 0 ? <div className="py-6 text-center text-xs text-text-muted">
        <FolderPlus className="mx-auto mb-3 h-7 w-7 opacity-60" />
        <p>{spaces.length === 0 ? "暂无资料库" : "没有匹配的资料库"}</p>
        {spaces.length === 0 ? <p className="mt-1.5">{canPublish ? "新建一个资料库，开始整理共享文件。" : "先配对发布电脑，请对方授权资料库。"}</p>
          : <button type="button" className="mt-2 text-accent" disabled={busy} onClick={() => setQuery("")}>清除搜索</button>}
      </div> : null}
    </nav>
  </aside>
}
