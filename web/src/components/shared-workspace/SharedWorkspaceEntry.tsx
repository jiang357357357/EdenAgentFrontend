import { ArrowUpRight, FolderSync } from "lucide-react"
import { useSharedWorkspace, type SharedWorkspaceScope } from "./use-shared-workspace"
import { sharedWorkspaceLabel } from "./shared-workspace-view"
import { useEffect, useState } from 'react'
import { readSharedDirectory } from '../../lib/shared-workspace-client'
import { getRuntimeOriginRevision } from '../../lib/runtime-origin'

export function SharedWorkspaceEntry({ sessionId, onOpen }: {
  sessionId: string
  onOpen(scope: SharedWorkspaceScope): void
}) {
  const [selection, setSelection] = useState<{ path: string }>()
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
  }, [sessionId])
  if (!selection) return <div className="border-b border-border px-3 py-2 text-xs text-text-muted">{error || '正在读取共享资料库…'}</div>
  return <SharedEntryStatus directoryPath={selection.path} sessionId={sessionId} onOpen={onOpen} />
}

function SharedEntryStatus({ directoryPath, sessionId, onOpen }: SharedWorkspaceScope & { onOpen(scope: SharedWorkspaceScope): void }) {
  const scope = { directoryPath, sessionId }
  const owner = useSharedWorkspace(scope)
  const { status, error } = owner.state
  return <div className="border-b border-border px-3 py-2">
    <button type="button" className="group flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm text-text hover:bg-card disabled:opacity-50"
      onClick={() => { if (owner.isCurrent()) onOpen(scope) }}>
      <FolderSync className="h-4 w-4 shrink-0" />
      <span className="flex-1">共享资料库</span>
      <ArrowUpRight className="h-3.5 w-3.5 text-text-muted group-hover:text-text" aria-hidden="true" />
    </button>
    <p className="break-words px-1 text-xs text-text-muted" role={error ? "alert" : "status"}>{error || sharedWorkspaceLabel(status)}</p>
  </div>
}
