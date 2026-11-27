import { ArrowUpRight, ChevronRight, FolderSync } from "lucide-react"
import { useSharedWorkspace, type SharedWorkspaceScope } from "./use-shared-workspace"
import { sharedWorkspaceLabel } from "./shared-workspace-view"
import { useEffect, useId, useState } from 'react'
import { readSharedDirectory } from '../../lib/shared-workspace-client'
import { getRuntimeOriginRevision } from '../../lib/runtime-origin'
import { SharedWorkspaceFiles } from './SharedWorkspaceFiles'

export function SharedWorkspaceEntry({ sessionId, onOpen }: {
  sessionId: string
  onOpen(scope: SharedWorkspaceScope): void
}) {
  const [selection, setSelection] = useState<Awaited<ReturnType<typeof readSharedDirectory>>>()
  const [directoryRefresh, setDirectoryRefresh] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true, request = 0
    const revision = getRuntimeOriginRevision()
    const refresh = () => {
      const current = ++request
      void readSharedDirectory(sessionId).then(value => {
        if (active && current === request && revision === getRuntimeOriginRevision()) { setSelection(value); setError('') }
      }).catch(reason => { if (active && current === request && revision === getRuntimeOriginRevision()) setError(String(reason)) })
    }
    refresh()
    window.addEventListener('edenagent:shared-directory-changed', refresh)
    return () => { active = false; window.removeEventListener('edenagent:shared-directory-changed', refresh) }
  }, [sessionId, directoryRefresh])
  if (!selection) return <div className="border-b border-border px-3 py-2 text-xs text-text-muted">{error || '正在读取共享资料库…'}</div>
  return <SharedEntryStatus key={`${selection.revision}:${selection.path}`} directoryPath={selection.path} sessionId={sessionId}
    onOpen={onOpen} refreshDirectory={() => { setSelection(undefined); setDirectoryRefresh(value => value + 1) }} />
}

function SharedEntryStatus({ directoryPath, sessionId, onOpen, refreshDirectory }: SharedWorkspaceScope & {
  onOpen(scope: SharedWorkspaceScope): void
  refreshDirectory(): void
}) {
  const scope = { directoryPath, sessionId }
  const owner = useSharedWorkspace(scope, { onPostureDirectoryChanged: refreshDirectory })
  const { status, posture, error } = owner.state
  const [expandedBinding, setExpandedBinding] = useState<string | null>(null)
  const treeId = useId()
  const binding = status?.available && status.bound && status.spaceId && posture
    ? `${posture.revision}:${status.spaceId}` : null
  const expanded = binding !== null && expandedBinding === binding && owner.isCurrent()
  const feedback = error || sharedWorkspaceLabel(status)

  return <div className="border-b border-border px-3 py-2">
    <div className="flex items-center gap-1">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm text-text enabled:hover:bg-card"
        disabled={!binding} aria-expanded={expanded} aria-controls={treeId}
        onClick={() => { if (owner.isCurrent()) setExpandedBinding(expanded ? null : binding) }}>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-text-muted motion-safe:transition-transform ${expanded ? 'rotate-90' : ''} ${binding ? '' : 'opacity-40'}`} aria-hidden="true" />
        <FolderSync className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">共享资料库</span>
      </button>
      <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-card hover:text-text"
        aria-label="打开共享资料库管理" title="打开共享资料库管理" onClick={() => { if (owner.isCurrent()) onOpen(scope) }}>
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
    {feedback ? <p className="break-words px-1 text-xs text-text-muted" role={error ? "alert" : "status"}>{feedback}</p> : null}
    <div id={treeId} hidden={!expanded}>
      {expanded && status?.spaceId ? <SharedWorkspaceFiles key={binding} scope={scope} spaceId={status.spaceId}
        lastSync={status.lastSync} isCurrent={owner.isCurrent} /> : null}
    </div>
  </div>
}
