import type { RuntimeMessage, RuntimeSession, RuntimeState } from "../types"

export const HISTORY_CACHE_LIMITS = {
  inactiveSessions: 4,
  inactiveBytes: 32 * 1024 * 1024,
  inactiveSessionBytes: 8 * 1024 * 1024,
  recentMessages: 200,
  recentBytes: 16 * 1024 * 1024,
  idleMs: 5 * 60_000,
}

const sizes = new WeakMap<RuntimeMessage, number>()

// A text/object payload estimate, not a measurement of the browser's heap.
function messageBytes(message: RuntimeMessage): number {
  const cached = sizes.get(message)
  if (cached !== undefined) return cached
  const pending: unknown[] = [message]
  let bytes = 0
  while (pending.length) {
    const value = pending.pop()
    if (typeof value === "string") bytes += value.length * 2
    else if (value && typeof value === "object") {
      bytes += 64
      for (const item of Object.values(value)) pending.push(item)
    } else bytes += 8
  }
  sizes.set(message, bytes)
  return bytes
}

export function historyBytes(session: RuntimeSession): number {
  return Object.values(session.messages).reduce((total, message) => total + messageBytes(message), 0)
}

export function historyIsProtected(state: RuntimeState, session: RuntimeSession): boolean {
  return session.id === state.activeSessionId || session.status !== "idle" || session.loadingOlderMessages
    || Object.values(session.messages).some(message => message.localOnly)
    || Object.values(state.permissions).some(request => request.sessionID === session.id)
    || Object.values(state.questions).some(request => request.sessionID === session.id)
    || Boolean(session.agentThreads?.some(thread => ["created", "queued", "running", "waiting"].includes(thread.status)))
}

function releaseHistory(session: RuntimeSession): RuntimeSession {
  return { ...session, messages: {}, messageOrder: [], turnTimings: undefined, directorRuns: undefined,
    hydrated: false, hasMoreMessages: false, messageCursor: undefined, loadingOlderMessages: false,
    historyBrowsing: false }
}

/** Evict reloadable payloads only. Session identity, bindings and drafts remain owned by their original stores. */
export function pruneSessionHistories(state: RuntimeState, now = Date.now(), departedSessionId?: string): RuntimeState {
  const idle = Object.values(state.sessions)
    .filter(session => session.messageOrder.length && !historyIsProtected(state, session))
    .sort((left, right) => (right.historyLastUsed ?? 0) - (left.historyLastUsed ?? 0))
  let count = 0, bytes = 0
  let sessions: RuntimeState["sessions"] | undefined
  for (const session of idle) {
    const size = historyBytes(session)
    const expired = session.historyLastUsed !== undefined && now - session.historyLastUsed >= HISTORY_CACHE_LIMITS.idleMs
    const keep = !expired && !(session.historyBrowsing && session.id === departedSessionId) && count < HISTORY_CACHE_LIMITS.inactiveSessions
      && size <= HISTORY_CACHE_LIMITS.inactiveSessionBytes && bytes + size <= HISTORY_CACHE_LIMITS.inactiveBytes
    if (keep) { count++; bytes += size; continue }
    sessions ??= { ...state.sessions }
    sessions[session.id] = releaseHistory(session)
  }
  return sessions ? { ...state, sessions } : state
}

export function shouldRestoreRecentHistory(session?: RuntimeSession, state?: RuntimeState): boolean {
  if (!session?.hydrated || session.status !== "idle" || session.historyBrowsing || session.loadingOlderMessages) return false
  if (state && (Object.values(state.permissions).some(request => request.sessionID === session.id)
    || Object.values(state.questions).some(request => request.sessionID === session.id))) return false
  if (Object.values(session.messages).some(message => message.localOnly)) return false
  if (session.agentThreads?.some(thread => ["created", "queued", "running", "waiting"].includes(thread.status))) return false
  return session.messageOrder.length > HISTORY_CACHE_LIMITS.recentMessages
    || historyBytes(session) > HISTORY_CACHE_LIMITS.recentBytes
}
