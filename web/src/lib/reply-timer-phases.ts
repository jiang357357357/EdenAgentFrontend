import type { ReplyTimerBreakdown, ReplyTimerSnapshot, ReplyTimerTurn } from '@eden/api'
import type { SessionEventInput } from './session-event'

export const timerPhaseKinds = new Set(['model.request', 'model.response', 'operation.started', 'operation.completed'])
type Phase = ReplyTimerBreakdown['thinking']
const emptyPhase = (): Phase => ({ elapsedMs: 0, activeIds: [] })

function updatePhase(previous: Phase, id: unknown, starting: boolean, time: number): Phase {
  if (typeof id !== 'string' || !id) return previous
  const phase = { ...previous, activeIds: [...previous.activeIds] }
  if (starting) {
    if (!phase.activeIds.includes(id)) {
      if (!phase.activeIds.length) phase.activeSince = time
      phase.activeIds.push(id)
    }
  } else if (phase.activeIds.includes(id)) {
    phase.activeIds = phase.activeIds.filter(value => value !== id)
    if (!phase.activeIds.length && phase.activeSince !== undefined) {
      phase.elapsedMs += Math.max(0, time - phase.activeSince)
      delete phase.activeSince
    }
  }
  return phase
}

function finishPhase(phase: Phase, time: number): Phase {
  return { elapsedMs: phase.elapsedMs + (phase.activeSince === undefined ? 0 : Math.max(0, time - phase.activeSince)), activeIds: [] }
}

/** Event time advances all clocks together; snapshots keep the same accumulator format. */
export function advanceTimerBreakdown(snapshot: ReplyTimerSnapshot | undefined,
  event: SessionEventInput, turn: ReplyTimerTurn, time: number): ReplyTimerBreakdown | undefined {
  if (!snapshot?.breakdown) return undefined
  const previous = snapshot.turn
  if (event.eventType === 'turn.started' && previous?.outcome === 'running' && previous.turnId !== turn.turnId) return undefined
  const result = { ...snapshot.breakdown, turnElapsedMs: Math.max(0, time - turn.startedAt) }
  if (event.eventType === 'turn.started') return { ...result, thinking: emptyPhase(), tools: emptyPhase() }
  if (previous?.turnId !== turn.turnId) return undefined
  const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload : {}
  if (event.eventType.startsWith('model.')) result.thinking = updatePhase(result.thinking, payload.requestId, event.eventType === 'model.request', time)
  if (event.eventType.startsWith('operation.')) result.tools = updatePhase(result.tools, payload.callId, event.eventType === 'operation.started', time)
  if (turn.outcome !== 'running') {
    result.thinking = finishPhase(result.thinking, time)
    result.tools = finishPhase(result.tools, time)
  }
  return result
}

export function timerBreakdownElapsed(snapshot: ReplyTimerSnapshot | undefined, extraMs: number) {
  if (!snapshot?.breakdown) return undefined
  const { thinking, tools, turnElapsedMs } = snapshot.breakdown
  const now = snapshot.observedAt + (snapshot.turn?.outcome === 'running' ? Math.max(0, extraMs) : 0)
  const elapsed = (phase: Phase) => phase.elapsedMs + (phase.activeSince === undefined ? 0 : Math.max(0, now - phase.activeSince))
  return { thinkingMs: elapsed(thinking), toolMs: elapsed(tools),
    turnMs: turnElapsedMs + (snapshot.turn?.outcome === 'running' ? Math.max(0, extraMs) : 0) }
}
