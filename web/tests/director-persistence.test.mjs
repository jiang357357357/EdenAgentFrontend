import assert from "node:assert/strict"
import test from "node:test"

import {
  latestCompanionDirectorRun,
} from "../src/lib/companion-director-state.ts"

test("selects the latest persisted director run while retaining history", () => {
  const runs = [
          {
            planID: "plan-old",
            userMessageID: "msg-old",
            source: "model",
            beats: [],
            status: "completed",
            completedBeatIndexes: [],
          },
          {
            planID: "plan-latest",
            userMessageID: "msg-latest",
            source: "model",
            beats: [
              { assistantID: 2, intent: "接话", speechAct: "react", addressTo: "user" },
            ],
            status: "failed",
            completedBeatIndexes: [],
            error: "模型请求超时",
          },
        ]
  const latest = latestCompanionDirectorRun(runs)

  assert.equal(latest?.planID, "plan-latest")
  assert.equal(latest?.userMessageID, "msg-latest")
  assert.equal(latest?.status, "failed")
  assert.deepEqual(runs.map((run) => run.planID), ["plan-old", "plan-latest"])
})
