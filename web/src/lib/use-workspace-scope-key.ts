import { useEffect, useState } from 'react'
import { useRuntimeOrigin } from './use-runtime-origin'
import { subscribeWorkspaceScope } from './workspace-scope-events'

export function useWorkspaceScopeKey(sessionId?: string) {
  const origin = useRuntimeOrigin()
  const [revision, setRevision] = useState(0)
  useEffect(() => subscribeWorkspaceScope(window, sessionId, () => setRevision(value => value + 1)), [origin, sessionId])
  return `${origin}:${sessionId ?? ''}:${revision}`
}
