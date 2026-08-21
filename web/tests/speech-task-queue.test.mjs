import assert from "node:assert/strict"
import test from "node:test"

import {
  isSpeechTaskCancelled,
  SpeechPlaybackQueue,
  SpeechSynthesisScheduler,
} from "../src/lib/speech-task-queue.ts"

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test("playback tasks use logical order and ignore duplicate identities", async () => {
  const played = []
  const queue = new SpeechPlaybackQueue()

  assert.equal(queue.enqueue({ id: "second", order: [0, 1], run: async () => { played.push("second") } }), true)
  assert.equal(queue.enqueue({ id: "first", order: [0, 0], run: async () => { played.push("first") } }), true)
  assert.equal(queue.enqueue({ id: "first", order: [0, 0], run: async () => { played.push("duplicate") } }), false)

  await queue.whenIdle()
  assert.deepEqual(played, ["first", "second"])
  assert.equal(queue.pendingCount, 0)
})

test("a failed playback task cannot poison the remaining queue", async () => {
  const played = []
  const errors = []
  const queue = new SpeechPlaybackQueue((error, taskId) => errors.push([taskId, String(error)]))

  queue.enqueue({ id: "broken", order: [0], run: async () => { throw new Error("broken audio") } })
  queue.enqueue({ id: "healthy", order: [1], run: async () => { played.push("healthy") } })

  await queue.whenIdle()
  assert.deepEqual(played, ["healthy"])
  assert.equal(errors.length, 1)
  assert.equal(errors[0][0], "broken")
})

test("an idle snapshot includes tasks appended while the queue is running", async () => {
  const releaseFirst = deferred()
  const played = []
  const queue = new SpeechPlaybackQueue()

  queue.enqueue({
    id: "first",
    order: [0],
    run: async () => {
      await releaseFirst.promise
      played.push("first")
    },
  })
  const idle = queue.whenIdle()
  await Promise.resolve()
  queue.enqueue({ id: "second", order: [1], run: async () => { played.push("second") } })
  releaseFirst.resolve()

  await idle
  assert.deepEqual(played, ["first", "second"])
})

test("an earlier reserved speech group blocks a later ready group", async () => {
  const played = []
  const queue = new SpeechPlaybackQueue()

  queue.reserveGroup("old-message", [0])
  queue.reserveGroup("new-message", [1])
  queue.enqueue({
    id: "new:0",
    group: "new-message",
    order: [1, 0],
    run: async () => { played.push("new:0") },
  })
  queue.sealGroup("new-message")
  await Promise.resolve()
  assert.deepEqual(played, [])

  queue.enqueue({
    id: "old:0",
    group: "old-message",
    order: [0, 0],
    run: async () => { played.push("old:0") },
  })
  queue.enqueue({
    id: "old:1",
    group: "old-message",
    order: [0, 1],
    run: async () => { played.push("old:1") },
  })
  queue.sealGroup("old-message")
  await queue.whenIdle()

  assert.deepEqual(played, ["old:0", "old:1", "new:0"])
})

test("cancelling a stale reserved revision unblocks the next speech group", async () => {
  const played = []
  const queue = new SpeechPlaybackQueue()

  queue.reserveGroup("stale", [0])
  queue.reserveGroup("fresh", [1])
  queue.enqueue({
    id: "fresh:0",
    group: "fresh",
    order: [1, 0],
    run: async () => { played.push("fresh") },
  })
  queue.sealGroup("fresh")
  await Promise.resolve()
  assert.deepEqual(played, [])

  assert.equal(queue.cancelGroup("stale"), true)
  await queue.whenIdle()
  assert.deepEqual(played, ["fresh"])
})

test("replacing a reserved revision in one tick does not report a false idle gap", async () => {
  const queue = new SpeechPlaybackQueue()
  queue.reserveGroup("revision", [0])
  const idle = queue.whenIdle()
  let settled = false
  void idle.then(() => { settled = true })

  queue.cancelGroup("revision")
  queue.reserveGroup("revision", [0])
  await Promise.resolve()
  assert.equal(settled, false)

  queue.sealGroup("revision")
  await idle
  assert.equal(settled, true)
})

test("cancelling playback aborts the active cycle and drops its pending tasks", async () => {
  const events = []
  const queue = new SpeechPlaybackQueue()

  queue.enqueue({
    id: "active",
    order: [0],
    run: async (signal) => {
      events.push("active:start")
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))
      events.push("active:abort")
    },
  })
  queue.enqueue({ id: "stale", order: [1], run: async () => { events.push("stale") } })
  const oldIdle = queue.whenIdle()
  await Promise.resolve()

  queue.cancel()
  await oldIdle
  queue.enqueue({ id: "fresh", order: [0], run: async () => { events.push("fresh") } })
  await queue.whenIdle()

  assert.deepEqual(events, ["active:start", "active:abort", "fresh"])
})

test("cancelling one playback scope preserves the active clip and unrelated pending work", async () => {
  const releaseActive = deferred()
  const activeStarted = deferred()
  const events = []
  const queue = new SpeechPlaybackQueue()

  queue.enqueue({
    id: "message-a:active",
    scope: "message-a",
    order: [0],
    run: async () => {
      events.push("a:active:start")
      activeStarted.resolve()
      await releaseActive.promise
      events.push("a:active:end")
    },
  })
  queue.enqueue({
    id: "message-a:stale",
    scope: "message-a",
    order: [1],
    run: async () => { events.push("a:stale") },
  })
  queue.enqueue({
    id: "message-b:pending",
    scope: "message-b",
    order: [2],
    run: async () => { events.push("b:pending") },
  })

  await activeStarted.promise
  assert.equal(queue.cancelScope("message-a"), 1)
  releaseActive.resolve()
  await queue.whenIdle()

  assert.deepEqual(events, ["a:active:start", "a:active:end", "b:pending"])
})

test("synthesis is serial inside one lane and parallel across messages", async () => {
  const scheduler = new SpeechSynthesisScheduler()
  const releaseFirst = deferred()
  const events = []

  const first = scheduler.schedule("message-a", async () => {
    events.push("a1:start")
    await releaseFirst.promise
    events.push("a1:end")
  })
  const second = scheduler.schedule("message-a", async () => {
    events.push("a2")
  })
  const other = scheduler.schedule("message-b", async () => {
    events.push("b1")
  })

  await other
  assert.deepEqual(events, ["a1:start", "b1"])
  releaseFirst.resolve()
  await Promise.all([first, second])
  assert.deepEqual(events, ["a1:start", "b1", "a1:end", "a2"])
  await Promise.resolve()
  assert.equal(scheduler.laneCount, 0)
})

test("cancelling synthesis prevents stale queued work from entering a new turn", async () => {
  const scheduler = new SpeechSynthesisScheduler()
  const releaseActive = deferred()
  const activeStarted = deferred()
  const events = []

  const active = scheduler.schedule("message", async () => {
    events.push("old:start")
    activeStarted.resolve()
    await releaseActive.promise
    return "old"
  })
  const stale = scheduler.schedule("message", async () => {
    events.push("old:queued")
    return "stale"
  })
  await activeStarted.promise

  scheduler.cancelAll()
  const fresh = scheduler.schedule("message", async () => {
    events.push("new")
    return "fresh"
  })
  const activeRejected = assert.rejects(active, isSpeechTaskCancelled)
  const staleRejected = assert.rejects(stale, isSpeechTaskCancelled)
  releaseActive.resolve()

  assert.equal(await fresh, "fresh")
  await activeRejected
  await staleRejected
  assert.deepEqual(events, ["old:start", "new"])
})

test("cancelling one synthesis lane does not cancel another message", async () => {
  const scheduler = new SpeechSynthesisScheduler()
  const releaseActive = deferred()
  const activeStarted = deferred()
  const events = []

  const stale = scheduler.schedule("message-a", async (signal) => {
    events.push("a:start")
    activeStarted.resolve()
    await releaseActive.promise
    if (signal.aborted) throw new Error("lane aborted")
    events.push("a:end")
  })
  const preserved = scheduler.schedule("message-b", async () => {
    events.push("b")
    return "preserved"
  })

  await activeStarted.promise
  assert.equal(scheduler.cancelLane("message-a"), true)
  assert.equal(scheduler.cancelLane("missing"), false)
  releaseActive.resolve()

  await assert.rejects(stale)
  assert.equal(await preserved, "preserved")
  assert.deepEqual(events, ["a:start", "b"])
})
