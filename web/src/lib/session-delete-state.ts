type SessionBoundItem = { sessionID?: string }

export type SessionDeleteState = {
  sessions: Record<string, unknown>
  sessionOrder: string[]
  permissions: Record<string, SessionBoundItem>
  permissionOrder: string[]
  questions: Record<string, SessionBoundItem>
  questionOrder: string[]
  activeSessionId?: string
}

export function removeSessionState<T extends SessionDeleteState>(state: T, sessionID: string) {
  delete state.sessions[sessionID]
  state.sessionOrder = state.sessionOrder.filter((id) => id !== sessionID)
  state.permissionOrder = state.permissionOrder.filter((id) => {
    if (state.permissions[id]?.sessionID !== sessionID) return true
    delete state.permissions[id]
    return false
  })
  state.questionOrder = state.questionOrder.filter((id) => {
    if (state.questions[id]?.sessionID !== sessionID) return true
    delete state.questions[id]
    return false
  })
  if (state.activeSessionId === sessionID) {
    state.activeSessionId = state.sessionOrder[0]
  }
}
