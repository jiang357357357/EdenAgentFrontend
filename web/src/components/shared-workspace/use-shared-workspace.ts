import { useEffect, useMemo, useRef, useState } from "react"
import { createSharedWorkspaceClient } from "../../lib/shared-workspace-client"
import { SharedWorkspaceStateOwner } from "./shared-workspace-state"

export interface SharedWorkspaceScope { sessionId: string; directoryPath: string }
export type SharedWorkspaceInvalidation = "directory" | "identity"

/** Each mounted view owns requests for one account, world, session and directory. */
export function useSharedWorkspace(scope: SharedWorkspaceScope, options: {
  details?: boolean
  scopeVersion?: number
  onFilesChanged?(): void
  onInvalidated?(reason: SharedWorkspaceInvalidation): void
} = {}) {
  const [, redraw] = useState(0)
  const callbacks = useRef(options)
  callbacks.current = options
  const { sessionId, directoryPath } = scope
  const scopeVersion = options.scopeVersion ?? 0
  const client = useMemo(() => createSharedWorkspaceClient(directoryPath, sessionId), [directoryPath, sessionId, scopeVersion])
  const owner = useMemo(() => new SharedWorkspaceStateOwner(client, () => redraw(value => value + 1),
    () => callbacks.current.onFilesChanged?.()), [client])
  useEffect(() => {
    owner.activate()
    void owner.refresh(callbacks.current.details)
    const timer = window.setInterval(() => {
      if (!owner.state.busy && !owner.state.loading) void owner.refresh(callbacks.current.details, "background")
    }, 5000)
    const invalidate = (reason: SharedWorkspaceInvalidation) => {
      client.invalidate(); owner.dispose(); callbacks.current.onInvalidated?.(reason)
    }
    const directoryChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail
      // A delayed or replayed notification can describe the scope already loaded here.
      if (detail?.path === directoryPath) return
      invalidate("directory")
    }
    const identityChanged = () => { if (!client.isCurrent()) invalidate("identity") }
    window.addEventListener("edenagent:shared-directory-changed", directoryChanged)
    window.addEventListener("edenagent:account-changed", identityChanged)
    window.addEventListener("edenagent:runtime-origin-changed", identityChanged)
    window.addEventListener("storage", identityChanged)
    return () => {
      window.clearInterval(timer)
      owner.dispose()
      window.removeEventListener("edenagent:shared-directory-changed", directoryChanged)
      window.removeEventListener("edenagent:account-changed", identityChanged)
      window.removeEventListener("edenagent:runtime-origin-changed", identityChanged)
      window.removeEventListener("storage", identityChanged)
    }
  }, [client, owner, sessionId])
  const observedSync = useRef<number | null>(null)
  useEffect(() => {
    const synced = owner.state.status?.lastSync ?? null
    if (synced && observedSync.current !== synced && owner.isCurrent() && !owner.state.busy) callbacks.current.onFilesChanged?.()
    observedSync.current = synced
  }, [owner.state.status?.lastSync, owner])
  return owner
}
