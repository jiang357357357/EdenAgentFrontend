export class SpeechTaskCancelledError extends Error {
  constructor() {
    super("speech task was cancelled")
    this.name = "SpeechTaskCancelledError"
  }
}

export function throwIfSpeechTaskCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new SpeechTaskCancelledError()
}

export function isSpeechTaskCancelled(error: unknown) {
  return error instanceof SpeechTaskCancelledError
}

type SynthesisTask<T> = (signal: AbortSignal) => Promise<T>

interface SynthesisLane {
  controller: AbortController
  tail: Promise<void>
}

/**
 * Serializes synthesis inside a logical lane while allowing unrelated
 * messages to synthesize independently. Cancellation replaces the whole set
 * of lanes, so stale queued work can never join a new speech turn.
 */
export class SpeechSynthesisScheduler {
  private readonly lanes = new Map<string, SynthesisLane>()

  schedule<T>(laneKey: string, task: SynthesisTask<T>): Promise<T> {
    let lane = this.lanes.get(laneKey)
    if (!lane) {
      lane = { controller: new AbortController(), tail: Promise.resolve() }
      this.lanes.set(laneKey, lane)
    }
    const activeLane = lane
    const signal = activeLane.controller.signal
    const result = activeLane.tail
      .catch(() => undefined)
      .then(async () => {
        throwIfSpeechTaskCancelled(signal)
        const value = await task(signal)
        throwIfSpeechTaskCancelled(signal)
        return value
      })
    const tail = result.then(() => undefined, () => undefined)
    activeLane.tail = tail
    void tail.finally(() => {
      if (this.lanes.get(laneKey) === activeLane && activeLane.tail === tail) this.lanes.delete(laneKey)
    })
    return result
  }

  cancelLane(laneKey: string) {
    const lane = this.lanes.get(laneKey)
    if (!lane) return false
    lane.controller.abort()
    this.lanes.delete(laneKey)
    return true
  }

  cancelAll() {
    for (const lane of this.lanes.values()) lane.controller.abort()
    this.lanes.clear()
  }

  get laneCount() {
    return this.lanes.size
  }
}

export interface SpeechPlaybackTask {
  id: string
  order: readonly number[]
  scope?: string
  group?: string
  run: (signal: AbortSignal) => Promise<void>
}

interface QueuedPlaybackTask extends SpeechPlaybackTask {
  insertionOrder: number
}

interface PlaybackGroup {
  id: string
  order: readonly number[]
  insertionOrder: number
  sealed: boolean
}

interface PlaybackCycle {
  controller: AbortController
  pending: QueuedPlaybackTask[]
  groups: Map<string, PlaybackGroup>
  seen: Set<string>
  running: boolean
  idlePromise: Promise<void>
  resolveIdle?: () => void
}

function compareOrder(left: readonly number[], right: readonly number[]) {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function newCycle(): PlaybackCycle {
  return {
    controller: new AbortController(),
    pending: [],
    groups: new Map(),
    seen: new Set(),
    running: false,
    idlePromise: Promise.resolve(),
  }
}

/**
 * A single-consumer playback queue with explicit cancellation and stable task
 * identities. Tasks are inserted by logical speech order before draining, not
 * by whichever synthesis request happens to finish first.
 */
export class SpeechPlaybackQueue {
  private cycle = newCycle()
  private insertionSequence = 0
  private readonly onError?: (error: unknown, taskId: string) => void

  constructor(onError?: (error: unknown, taskId: string) => void) {
    this.onError = onError
  }

  /**
   * Reserve an immutable position for a logical streaming speech group before
   * its first synthesized chunk is ready. Later groups cannot pass an earlier
   * open reservation merely because their network request finishes first.
   */
  reserveGroup(id: string, order: readonly number[]) {
    const cycle = this.cycle
    if (!id || cycle.groups.has(id)) return false
    this.ensurePending(cycle)
    cycle.groups.set(id, {
      id,
      order: [...order],
      insertionOrder: this.insertionSequence++,
      sealed: false,
    })
    return true
  }

  /** Mark that no more chunks will be added to a reserved group. */
  sealGroup(id: string) {
    const cycle = this.cycle
    const group = cycle.groups.get(id)
    if (!group || group.sealed) return false
    group.sealed = true
    if (!cycle.running) queueMicrotask(() => void this.drain(cycle))
    return true
  }

  /** Drop a stale revision while allowing an already playing chunk to finish. */
  cancelGroup(id: string) {
    const cycle = this.cycle
    const existed = cycle.groups.delete(id)
    const removed = cycle.pending.filter((task) => task.group === id)
    if (removed.length) {
      cycle.pending = cycle.pending.filter((task) => task.group !== id)
      for (const task of removed) cycle.seen.delete(task.id)
    }
    if (!cycle.running) {
      if (this.isIdle(cycle)) {
        // A stream rewrite cancels and re-reserves the same logical group in
        // one call stack. Defer the idle decision so that atomic replacement
        // cannot briefly release output gates between revisions.
        queueMicrotask(() => {
          if (this.cycle === cycle && this.isIdle(cycle)) this.resolveIdle(cycle)
        })
      }
      else queueMicrotask(() => void this.drain(cycle))
    }
    return existed || removed.length > 0
  }

  enqueue(task: SpeechPlaybackTask) {
    const cycle = this.cycle
    if (!task.id || cycle.seen.has(task.id)) return false
    cycle.seen.add(task.id)
    while (cycle.seen.size > 2048) {
      const oldest = cycle.seen.values().next().value
      if (oldest === undefined) break
      cycle.seen.delete(oldest)
    }
    this.ensurePending(cycle)
    const queued: QueuedPlaybackTask = {
      ...task,
      insertionOrder: this.insertionSequence++,
    }
    cycle.pending.push(queued)
    cycle.pending.sort((left, right) => (
      compareOrder(left.order, right.order) || left.insertionOrder - right.insertionOrder
    ))
    if (!cycle.running) queueMicrotask(() => void this.drain(cycle))
    return true
  }

  whenIdle() {
    return this.cycle.idlePromise
  }

  cancel() {
    const previous = this.cycle
    previous.controller.abort()
    previous.pending = []
    previous.resolveIdle?.()
    previous.resolveIdle = undefined
    this.cycle = newCycle()
  }

  /**
   * Removes work which has not started for one logical message. The active
   * task is deliberately allowed to finish so a stream correction cannot cut
   * off audio which the user is already hearing.
   */
  cancelScope(scope: string) {
    const cycle = this.cycle
    const removed = cycle.pending.filter((task) => task.scope === scope)
    if (!removed.length) return 0
    cycle.pending = cycle.pending.filter((task) => task.scope !== scope)
    for (const task of removed) cycle.seen.delete(task.id)
    if (this.isIdle(cycle)) {
      queueMicrotask(() => {
        if (this.cycle === cycle && this.isIdle(cycle)) this.resolveIdle(cycle)
      })
    }
    return removed.length
  }

  get pendingCount() {
    return this.cycle.pending.length + (this.cycle.running ? 1 : 0)
  }

  private ensurePending(cycle: PlaybackCycle) {
    if (cycle.resolveIdle) return
    cycle.idlePromise = new Promise<void>((resolve) => {
      cycle.resolveIdle = resolve
    })
  }

  private isIdle(cycle: PlaybackCycle) {
    return !cycle.running && cycle.pending.length === 0 && cycle.groups.size === 0
  }

  private resolveIdle(cycle: PlaybackCycle) {
    cycle.resolveIdle?.()
    cycle.resolveIdle = undefined
    cycle.idlePromise = Promise.resolve()
  }

  private takeNext(cycle: PlaybackCycle): QueuedPlaybackTask | undefined {
    while (true) {
      const group = [...cycle.groups.values()].sort((left, right) => (
        compareOrder(left.order, right.order) || left.insertionOrder - right.insertionOrder
      ))[0]
      if (!group) return cycle.pending.shift()

      const ungroupedIndex = cycle.pending.findIndex((task) => !task.group)
      if (
        ungroupedIndex >= 0 &&
        compareOrder(cycle.pending[ungroupedIndex].order, group.order) < 0
      ) {
        return cycle.pending.splice(ungroupedIndex, 1)[0]
      }

      const groupTaskIndex = cycle.pending.findIndex((task) => task.group === group.id)
      if (groupTaskIndex >= 0) return cycle.pending.splice(groupTaskIndex, 1)[0]
      if (!group.sealed) return undefined
      cycle.groups.delete(group.id)
    }
  }

  private async drain(cycle: PlaybackCycle) {
    if (cycle.running || cycle.controller.signal.aborted) return
    cycle.running = true
    try {
      while (this.cycle === cycle && !cycle.controller.signal.aborted) {
        const task = this.takeNext(cycle)
        if (!task) break
        try {
          await task.run(cycle.controller.signal)
        } catch (error) {
          if (!cycle.controller.signal.aborted && !isSpeechTaskCancelled(error)) {
            this.onError?.(error, task.id)
          }
        }
      }
    } finally {
      cycle.running = false
      if (this.cycle === cycle && this.isIdle(cycle)) this.resolveIdle(cycle)
    }
  }
}
