import { FolderSync, GitCompareArrows, History, Radio, RefreshCw, ShieldCheck } from "lucide-react"

export const sharedWorkspaceSections = [
  { id: "libraries", label: "资料库", icon: FolderSync },
  { id: "network", label: "设备配对", icon: Radio },
  { id: "sync", label: "同步状态", icon: RefreshCw },
  { id: "conflicts", label: "冲突处理", icon: GitCompareArrows },
  { id: "history", label: "文件历史", icon: History },
  { id: "members", label: "共享权限", icon: ShieldCheck },
] as const

export type SharedWorkspaceSection = typeof sharedWorkspaceSections[number]["id"]

export function SharedWorkspaceNavigation({ active, prefix, pending, conflicts, onSelect }: {
  active: SharedWorkspaceSection
  prefix: string
  pending: number
  conflicts: number
  onSelect(section: SharedWorkspaceSection): void
}) {
  return <nav aria-label="共享资料库功能" className="flex min-h-0 shrink-0 flex-col border-b border-border/70 bg-library-card/45 md:w-48 md:border-b-0 md:border-r">
    <p className="hidden shrink-0 px-5 pb-3 pt-6 text-xs font-medium text-text-muted md:block">功能导航</p>
    <div className="flex min-h-0 gap-1 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:px-3 md:pb-5 md:pt-0">
      {sharedWorkspaceSections.map(({ id, label, icon: Icon }) => {
        const count = id === "conflicts" ? conflicts : id === "sync" ? pending : 0
        return <button type="button" key={id} id={`${prefix}-navigation-${id}`} aria-label={label}
          aria-current={active === id ? "page" : undefined} aria-controls={`${prefix}-panel-${id}`} onClick={() => onSelect(id)}
          className={`flex shrink-0 items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-accent ${active === id
            ? "border-accent/30 bg-accent/10 font-medium text-accent" : "border-transparent text-text-muted hover:bg-library-card hover:text-text"}`}>
          <Icon className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">{label}</span>
          {count > 0 ? <span className={`ml-auto rounded px-1.5 text-xs tabular-nums ${id === "conflicts" ? "bg-warning/10 text-warning" : "bg-accent/10 text-accent"}`}>{count}</span> : null}
        </button>
      })}
    </div>
  </nav>
}
