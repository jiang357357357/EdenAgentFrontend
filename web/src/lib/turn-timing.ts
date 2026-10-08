import type { RuntimeMessage, RuntimeSession, TurnTiming } from "../types"

export interface TurnTimingEvent {
  type: "session.turn_timing"
  properties: { sessionID: string; turnID: string; timing: TurnTiming }
}

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

export function readTurnTiming(value: unknown): TurnTiming | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const timing = value as Record<string, unknown>
  const startedAt = timestamp(timing.startedAt) ? timing.startedAt : undefined
  const completedAt = timestamp(timing.completedAt) ? timing.completedAt : undefined
  if (startedAt === undefined && completedAt === undefined) return undefined
  return { ...(startedAt !== undefined ? { startedAt } : {}), ...(completedAt !== undefined ? { completedAt } : {}) }
}

export function isTurnTimingEvent(event: { type: string; properties?: unknown }): event is TurnTimingEvent {
  if (event.type !== "session.turn_timing" || !event.properties || typeof event.properties !== "object") return false
  const value = event.properties as Record<string, unknown>
  return typeof value.sessionID === "string" && typeof value.turnID === "string" && Boolean(value.turnID)
    && Boolean(readTurnTiming(value.timing))
}

export function applyTurnTiming(session: RuntimeSession, event: TurnTimingEvent) {
  const { turnID, timing } = event.properties
  session.turnTimings = { ...session.turnTimings,
    [turnID]: { ...session.turnTimings?.[turnID], ...readTurnTiming(timing) } }
}

/** A reply can span tools and multiple speakers; show its elapsed time only at the end. */
export function replyDurations(messages: RuntimeMessage[], liveTimings?: Record<string, TurnTiming>): Map<string, number> {
  const lastReplies = new Map<string, RuntimeMessage>()
  const historicalTimings = new Map<string, TurnTiming>()
  for (const message of messages) {
    if (message.role === "assistant" && message.turnID && !message.id.startsWith("compaction:")) {
      lastReplies.set(message.turnID, message)
      historicalTimings.set(message.turnID, { ...historicalTimings.get(message.turnID), ...readTurnTiming(message.turnTiming) })
    }
  }
  const durations = new Map<string, number>()
  for (const [turnID, message] of lastReplies) {
    const timing = { ...historicalTimings.get(turnID), ...liveTimings?.[turnID] }
    if (!message.error && message.completionState !== "provisional"
      && timestamp(timing.startedAt) && timestamp(timing.completedAt) && timing.completedAt >= timing.startedAt) {
      durations.set(message.id, timing.completedAt - timing.startedAt)
    }
  }
  return durations
}
