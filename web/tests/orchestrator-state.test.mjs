import assert from "node:assert/strict"
import test from "node:test"

import {
  localOrchestratorRun,
  latestOrchestratorRun,
  reduceOrchestratorRun,
  upsertOrchestratorRun,
} from "../src/lib/orchestrator-state.ts"

test("tracks the current character main-agent lifecycle", () => {
  let run = localOrchestratorRun("message-1")
  assert.equal(run.status, "planning")

  run = reduceOrchestratorRun(
    run,
    {
      type: "orchestrator.started",
      properties: {
        orchestrationID: "orc-1",
        userMessageID: "message-1",
        phase: "伊芙正在理解并处理请求",
      },
    },
  )
  assert.equal(run.status, "running")
  assert.equal(run.phase, "伊芙正在理解并处理请求")

  run = reduceOrchestratorRun(
    run,
    {
      type: "orchestrator.activity",
      properties: {
        orchestrationID: "orc-1",
        eventType: "tool_execution_start",
        toolName: "spawn_agent",
      },
    },
  )
  assert.equal(run.toolName, "spawn_agent")

  run = reduceOrchestratorRun(
    run,
    {
      type: "orchestrator.completed",
      properties: {
        orchestrationID: "orc-1",
        brief: { summary: "资料已整理" },
      },
    },
  )
  assert.equal(run.status, "completed")
  assert.equal(run.summary, "资料已整理")
  assert.equal(run.userMessageID, "message-1")
})

test("restores the last persisted run when legacy records have no timestamps", () => {
  const latest = latestOrchestratorRun([
    { orchestrationID: "orc-old", userMessageID: "message-old", status: "completed" },
    { orchestrationID: "orc-new", userMessageID: "message-new", status: "completed" },
  ])

  assert.equal(latest?.orchestrationID, "orc-new")
})

test("main-agent failure keeps a concise visible phase", () => {
  const run = reduceOrchestratorRun(
    localOrchestratorRun("message-2"),
    {
      type: "orchestrator.failed",
      properties: { orchestrationID: "orc-2", error: "temporary failure" },
    },
  )

  assert.equal(run.status, "failed")
  assert.equal(run.phase, "处理失败")
  assert.doesNotMatch(run.phase, /主智能体/)
})

test("replaces the optimistic run and retains the completed turn for history", () => {
  const local = localOrchestratorRun("message-3")
  const completed = reduceOrchestratorRun(local, {
    type: "orchestrator.completed",
    properties: {
      orchestrationID: "orc-3",
      userMessageID: "message-3",
      brief: { summary: "已经理解这一轮" },
    },
  })

  const runs = upsertOrchestratorRun([local], completed)
  assert.equal(runs.length, 1)
  assert.equal(runs[0].orchestrationID, "orc-3")
  assert.equal(runs[0].userMessageID, "message-3")
  assert.equal(runs[0].status, "completed")
  assert.equal(runs[0].summary, "已经理解这一轮")
})

test("does not regress a terminal run when started is replayed", () => {
  const completed = reduceOrchestratorRun(localOrchestratorRun("message-4"), {
    type: "orchestrator.completed",
    properties: { orchestrationID: "orc-4", userMessageID: "message-4" },
  })
  const replayed = reduceOrchestratorRun(completed, {
    type: "orchestrator.started",
    properties: { orchestrationID: "orc-4", userMessageID: "message-4" },
  })

  assert.equal(replayed.status, "completed")
})

test("does not inherit a user message id across different runs", () => {
  const previous = reduceOrchestratorRun(localOrchestratorRun("message-old"), {
    type: "orchestrator.completed",
    properties: { orchestrationID: "orc-old", userMessageID: "message-old" },
  })
  const next = reduceOrchestratorRun(previous, {
    type: "orchestrator.started",
    properties: { orchestrationID: "orc-new" },
  })

  assert.equal(next.userMessageID, undefined)
  assert.equal(next.status, "running")
})
