import type { ReplyTimerSnapshot, ReplyTimerTurn } from '@eden/api'
import type { SessionEventInput } from './session-event'
import { advanceTimerBreakdown, timerBreakdownElapsed, timerPhaseKinds } from './reply-timer-phases.ts'

export interface ReplyTimerView {
  snapshot?: ReplyTimerSnapshot
  receivedAt: number
  connected: boolean
  error?: string
}

export function replyTimerElapsed(view: ReplyTimerView, now: number): number {
  const turn = view.snapshot?.turn
  if (!turn) return 0
  if (turn.finishedAt !== undefined) return Math.max(0, turn.finishedAt - turn.startedAt)
  return Math.max(0, (view.snapshot!.observedAt - turn.startedAt) + Math.max(0, now - view.receivedAt))
}

export function replyTimerDurations(view: ReplyTimerView, now: number) {
  return timerBreakdownElapsed(view.snapshot, Math.max(0, now - view.receivedAt))
}

export function formatReplyTimer(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000)
  const two = (value: number) => String(value).padStart(2, '0')
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}`
    : `${two(Math.floor(seconds / 60))}:${two(seconds % 60)}`
}

type Access = {
  read(): Promise<ReplyTimerSnapshot>
  events(listener: (event: SessionEventInput) => void): () => void
  status(listener: (status: { sessionId: string; connected: boolean; error?: string }) => void): () => void
  now(): number
  changed(view: ReplyTimerView): void
}

const boundaryOutcomes = new Map<string, ReplyTimerTurn['outcome']>([
  ['turn.started', 'running'], ['turn.completed', 'completed'], ['input.interrupted', 'interrupted'], ['turn.failed', 'failed'],
])

/** Restore on opening/reconnection; live boundaries reuse the existing session channel. No polling. */
export function watchReplyTimer(sessionId: string, access: Access): () => void {
  let view: ReplyTimerView = { receivedAt: access.now(), connected: false }
  let seq = 0n, disposed = false, pending = false, refreshAgain = false, requested = false
  const publish = () => { if (!disposed) access.changed(view) }
  const refresh = () => {
    if (disposed || pending) return
    pending = true; requested = true
    void access.read().then(snapshot => {
      if (disposed) return
      if (BigInt(snapshot.seq) < seq) { if (!view.snapshot?.breakdown) refreshAgain = true; return }
      seq = BigInt(snapshot.seq)
      view = { ...view, snapshot, receivedAt: access.now(), error: undefined }
      publish()
    }).catch(error => {
      if (disposed) return
      view = { ...view, error: error instanceof Error ? error.message : String(error) }
      publish()
    }).finally(() => {
      pending = false
      if (refreshAgain) { refreshAgain = false; refresh() }
    })
  }
  const events = access.events(event => {
    if (disposed || event.sessionId !== sessionId || !event.turnId || BigInt(event.seq) <= seq) return
    const outcome = boundaryOutcomes.get(event.eventType)
    if (!outcome && !timerPhaseKinds.has(event.eventType)) return
    const timestamp = Number(event.createdAt)
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) return
    const previous = view.snapshot?.turn
    if (!outcome && (previous?.turnId !== event.turnId || previous.outcome !== 'running')) return
    seq = BigInt(event.seq)
    const payload = event.payload as { turnTiming?: { startedAt?: number } }
    const startedAt = event.eventType === 'turn.started' ? timestamp
      : previous?.turnId === event.turnId ? previous.startedAt : payload?.turnTiming?.startedAt
    if (!Number.isSafeInteger(startedAt) || startedAt === undefined || startedAt < 0 || startedAt > timestamp) {
      refreshAgain = pending
      refresh()
      return
    }
    const state = outcome ?? previous!.outcome
    const turn: ReplyTimerTurn = { turnId: event.turnId, startedAt, outcome: state,
      ...(state === 'running' ? {} : { finishedAt: timestamp }) }
    const breakdown = advanceTimerBreakdown(view.snapshot, event, turn, timestamp)
    const restoreDetails = Boolean(view.snapshot?.breakdown && !breakdown)
    view = { ...view, snapshot: { turn, seq: String(seq), observedAt: timestamp,
      ...(breakdown ? { breakdown } : {}) }, receivedAt: access.now(), error: undefined }
    publish()
    if (restoreDetails) { refreshAgain = pending; refresh() }
  })
  const status = access.status(next => {
    if (disposed || next.sessionId !== sessionId) return
    const reconnected = next.connected && !view.connected
    view = { ...view, connected: next.connected }
    publish()
    if (reconnected) refresh()
  })
  if (!requested) refresh()
  return () => { disposed = true; events(); status() }
}
