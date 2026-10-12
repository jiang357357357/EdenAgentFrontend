import type { MessageData, RuntimeMessage, RuntimeSession, Session } from "../types"

// Reducer snapshots are immutable. Weak keys let discarded histories and
// accounts be collected instead of retaining them in a global ID cache.
const sessions = new WeakMap<RuntimeSession, Session>()
const messages = new WeakMap<RuntimeMessage, {
  running: boolean
  duration?: number
  view: MessageData
}>()

export function cachedSessionView(source: RuntimeSession, project: (source: RuntimeSession) => Session): Session {
  const cached = sessions.get(source)
  if (cached) return cached
  const view = project(source)
  sessions.set(source, view)
  return view
}

export function cachedMessageView(
  source: RuntimeMessage,
  running: boolean,
  duration: number | undefined,
  project: (source: RuntimeMessage, running: boolean) => MessageData,
): MessageData {
  const cached = messages.get(source)
  if (cached && cached.running === running && cached.duration === duration) return cached.view
  const view = { ...project(source, running), replyDurationMs: duration }
  messages.set(source, { running, duration, view })
  return view
}
