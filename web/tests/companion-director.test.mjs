import assert from "node:assert/strict"
import test from "node:test"

import {
  applyCompanionSpeakerEvent,
  completeCompanionDirectorRun,
  setCompanionDirectorPlan,
  startCompanionDirectorRun,
} from "../src/lib/companion-director-state.ts"

test("tracks planning, selected order, active beat, and completion", () => {
  let run = startCompanionDirectorRun(2)
  assert.equal(run.status, "planning")
  assert.equal(run.participantCount, 2)

  run = setCompanionDirectorPlan({
    planID: "plan-1",
    source: "model",
    diagnostic: null,
    participantCount: 2,
    scene: {
      domain: "game",
      interactionType: "conversation",
      confidence: 0.91,
      summary: "讨论当前游戏局面",
    },
    execution: {
      mode: "ensemble",
      leadAssistantID: 1,
      toolOwnerAssistantID: null,
      observationStrategy: "independent",
    },
    beats: [
      { assistantID: 1, intent: "先回应", speechAct: "respond", addressTo: "user" },
      { assistantID: 2, intent: "接话", speechAct: "react", addressTo: "assistant:1", replyToBeat: 0 },
      { assistantID: 1, intent: "收束", speechAct: "close", addressTo: "assistant:2", replyToBeat: 1 },
    ],
  })
  assert.deepEqual(run.beats.map((beat) => beat.assistantID), [1, 2, 1])
  assert.equal(run.scene?.domain, "game")
  assert.equal(run.execution?.observationStrategy, "independent")

  run = applyCompanionSpeakerEvent(run, { planID: "plan-1", beatIndex: 1, phase: "started" })
  assert.equal(run.activeBeatIndex, 1)
  assert.equal(run.status, "running")

  run = applyCompanionSpeakerEvent(run, { planID: "plan-1", beatIndex: 1, phase: "finished" })
  assert.deepEqual(run.completedBeatIndexes, [1])
  assert.equal(run.activeBeatIndex, undefined)

  run = completeCompanionDirectorRun(run)
  assert.equal(run.status, "completed")
})

test("ignores speaker events from a stale plan", () => {
  const run = setCompanionDirectorPlan({
    planID: "current-plan",
    source: "model",
    beats: [{ assistantID: 3, intent: "回应", speechAct: "respond", addressTo: "user" }],
  })
  const unchanged = applyCompanionSpeakerEvent(run, {
    planID: "stale-plan",
    beatIndex: 0,
    phase: "started",
  })
  assert.deepEqual(unchanged, run)
})

test("keeps a failed persisted director run failed when the session becomes idle", () => {
  const failed = {
    ...setCompanionDirectorPlan({
      planID: "failed-plan",
      userMessageID: "msg-user",
      source: "model",
      beats: [{ assistantID: 1, intent: "回应", speechAct: "respond", addressTo: "user" }],
    }),
    status: "failed",
    error: "模型请求超时",
  }
  const unchanged = completeCompanionDirectorRun(failed)
  assert.equal(unchanged.status, "failed")
  assert.equal(unchanged.userMessageID, "msg-user")
})
