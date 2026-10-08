/** Retire project previews only when their owning session or account changes. */
export function subscribeWorkspaceScope(target: EventTarget, sessionId: string | undefined, changed: () => void) {
  const workspaceChanged = (event: Event) => {
    const detail = (event as CustomEvent<{ sessionId?: string; sessionID?: string }>).detail
    if (sessionId && (detail?.sessionId === sessionId || detail?.sessionID === sessionId)) changed()
  }
  target.addEventListener('edenagent:workspace-changed', workspaceChanged)
  target.addEventListener('edenagent:account-changed', changed)
  return () => {
    target.removeEventListener('edenagent:workspace-changed', workspaceChanged)
    target.removeEventListener('edenagent:account-changed', changed)
  }
}
