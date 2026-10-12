import { useEffect, useRef, useState, type Dispatch } from "react"
import { listMessagesRaw } from "../lib/agent-client"
import { hydrateSessionMessages, type RuntimeAction } from "../lib/session-reducer"
import { shouldRestoreRecentHistory } from "../lib/session-history-cache"
import type { RuntimeState } from "../types"

type Attempt = { request: string; result: string }
function rememberAttempt(attempts: Map<string, Attempt>, sessionId: string, attempt: Attempt) {
  attempts.delete(sessionId)
  attempts.set(sessionId, attempt)
  if (attempts.size <= 32) return
  const oldest = attempts.keys().next().value
  if (oldest !== undefined) attempts.delete(oldest)
}

/** Reload the bounded server page only after leaving history browsing or finishing a turn. */
export function useSessionHistoryMaintenance(state: RuntimeState, enabled: boolean, epoch: number,
  dispatch: Dispatch<RuntimeAction>, captureGuard: () => () => boolean) {
  const latest = useRef(state)
  latest.current = state
  const selection = useRef({ id: state.activeSessionId, version: 0 })
  if (selection.current.id !== state.activeSessionId) selection.current = { id: state.activeSessionId, version: selection.current.version + 1 }
  const attempts = useRef(new Map<string, Attempt>())
  const pending = useRef(new Set<string>())
  const generation = useRef(0)
  const [revision, refresh] = useState(0)
  useEffect(() => {
    generation.current++
    attempts.current = new Map()
    pending.current = new Set()
    return () => { generation.current++ }
  }, [epoch, enabled, state.connectionState])
  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => dispatch({ type: "pruneHistories" }), 60_000)
    return () => window.clearInterval(timer)
  }, [enabled, dispatch])
  useEffect(() => {
    const sessionId = state.activeSessionId
    const session = sessionId ? state.sessions[sessionId] : undefined
    if (!enabled || !sessionId || !session || !shouldRestoreRecentHistory(session, state) || pending.current.has(sessionId)) return
    // One oversized message/page cannot be reduced by refetching the same page repeatedly.
    const signature = `${session.messageOrder[0]}:${session.messageOrder.at(-1)}:${session.messageOrder.length}`
    const previous = attempts.current.get(sessionId)
    if (previous?.request === signature || previous?.result === signature) return
    const current = captureGuard()
    const version = generation.current
    const selectionVersion = selection.current.version
    const operations = pending.current
    const attempted = attempts.current
    operations.add(sessionId)
    void listMessagesRaw(sessionId).then(page => {
      const active = latest.current.sessions[sessionId]
      const liveSignature = active ? `${active.messageOrder[0]}:${active.messageOrder.at(-1)}:${active.messageOrder.length}` : ""
      if (generation.current !== version || selection.current.version !== selectionVersion || !current() || liveSignature !== signature
        || latest.current.activeSessionId !== sessionId || !shouldRestoreRecentHistory(active, latest.current)) return
      if (!active || session.messageOrder.some((id, index) => active.messageOrder[index] !== id || active.messages[id] !== session.messages[id])) return
      const ids = page.items.map(message => message.info.id)
      rememberAttempt(attempted, sessionId, { request: signature, result: `${ids[0]}:${ids.at(-1)}:${ids.length}` })
      dispatch(hydrateSessionMessages(sessionId, page))
    }).catch(error => {
      if (generation.current === version && current()) {
        rememberAttempt(attempted, sessionId, { request: signature, result: "" })
        console.warn("[History] recent page restore failed", error)
      }
    }).finally(() => {
      operations.delete(sessionId)
      if (generation.current === version) refresh(value => value + 1)
    })
  }, [state, enabled, epoch, dispatch, captureGuard, revision])
}
