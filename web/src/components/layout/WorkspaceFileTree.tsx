import { ChevronDown, ChevronRight, File, FolderOpen } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { listWorkspaceDirectory, type WorkspaceEntry } from "../../lib/agent-client"
import { NoticeCard, noticeActionClass } from "../feedback"

export function WorkspaceFileTree({ sessionId, entry, depth = 0, onOpenFile, isCurrent, revision = 0 }: {
  sessionId: string
  entry: WorkspaceEntry
  depth?: number
  onOpenFile(entry: WorkspaceEntry): void
  isCurrent(): boolean
  revision?: number
}) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<WorkspaceEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const mounted = useRef(false)
  const requestSequence = useRef(0)
  const observedRevision = useRef(revision)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestSequence.current++ } }, [])
  const read = async () => {
    if (!isCurrent()) return
    const sequence = ++requestSequence.current
    setLoading(true)
    setError("")
    try {
      const result = await listWorkspaceDirectory(sessionId, entry.path)
      if (mounted.current && isCurrent() && sequence === requestSequence.current) setChildren(result.entries)
    } catch (reason) {
      if (mounted.current && isCurrent() && sequence === requestSequence.current) setError(reason instanceof Error ? reason.message : "读取文件夹失败")
    } finally {
      if (mounted.current && isCurrent() && sequence === requestSequence.current) setLoading(false)
    }
  }
  useEffect(() => {
    if (observedRevision.current === revision) return
    observedRevision.current = revision
    if (open) void read()
    else { requestSequence.current++; setChildren(null); setLoading(false) }
  }, [revision])
  const toggle = async () => {
    if (!isCurrent()) return
    if (entry.type !== "directory") { onOpenFile(entry); return }
    const nextOpen = !open
    setOpen(nextOpen)
    if (nextOpen && !children && !loading) await read()
  }
  return <div>
    <button type="button" onClick={() => void toggle()} className="flex h-8 w-full items-center gap-1.5 truncate pr-2 text-left text-[clamp(14px,1.65vh,17px)] text-text-muted hover:bg-card hover:text-text" style={{ paddingLeft: `${0.55 + depth * 0.85}rem` }} title={entry.path}>
      {entry.type === "directory" ? (open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />) : <span className="w-4 shrink-0" />}
      {entry.type === "directory" ? <FolderOpen className="h-4 w-4 shrink-0 text-accent/80" /> : <File className="h-4 w-4 shrink-0" />}
      <span className="truncate">{entry.name}</span>
    </button>
    {open ? <div>
      {loading ? <div className="py-1 text-xs text-text-muted" style={{ paddingLeft: `${2.4 + depth * 0.85}rem` }}>读取中…</div> : null}
      {error ? <NoticeCard tone="error" title="文件夹读取失败" description={error} className="my-1"
        actions={<button type="button" className={noticeActionClass} onClick={() => void read()} disabled={loading}>重新读取</button>} /> : null}
      {children?.map(child => <WorkspaceFileTree key={child.path} sessionId={sessionId} entry={child} depth={depth + 1} onOpenFile={onOpenFile} isCurrent={isCurrent} revision={revision} />)}
      {children?.length === 0 ? <div className="py-1 text-xs text-text-muted" style={{ paddingLeft: `${2.4 + depth * 0.85}rem` }}>空目录</div> : null}
    </div> : null}
  </div>
}
