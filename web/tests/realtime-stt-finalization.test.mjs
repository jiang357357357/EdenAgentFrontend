import assert from "node:assert/strict"
import test from "node:test"

import { realtimeSTTFinalization } from "../src/lib/realtime-stt-finalization.ts"

test("a sentence-end result remains provisional while stop finalization is pending", () => {
  const result = realtimeSTTFinalization({
    type: "result",
    accumulated: "实时草稿",
    is_interim: false,
    sentence_end: true,
  }, "实时草稿")

  assert.deepEqual(result, {
    authoritative: false,
    settle: false,
    text: "实时草稿",
  })
})

test("commit_hint is authoritative and replaces the provisional transcript", () => {
  const result = realtimeSTTFinalization({
    type: "commit_hint",
    final_text: "最终校正文本",
    should_commit: true,
  }, "实时草稿")

  assert.deepEqual(result, {
    authoritative: true,
    settle: true,
    text: "最终校正文本",
  })
})

test("status.final_text is authoritative when the provider finalizes on stop", () => {
  const result = realtimeSTTFinalization({
    type: "status",
    status: "stopped",
    final_text: "停止后的完整文本",
  }, "实时草稿")

  assert.deepEqual(result, {
    authoritative: true,
    settle: true,
    text: "停止后的完整文本",
  })
})

test("offline final_result overwrites the realtime preview", () => {
  const result = realtimeSTTFinalization({
    type: "final_result",
    status: "stopped",
    final_text: "所以你的意思是你不打，昨天回去了吗？",
  }, "所以你的意思是你不打。昨天回去了吗？")

  assert.deepEqual(result, {
    authoritative: true,
    settle: true,
    text: "所以你的意思是你不打，昨天回去了吗？",
  })
})

test("a bare stopped status falls back to the latest provisional transcript", () => {
  const result = realtimeSTTFinalization({ type: "status", status: "stopped" }, "实时草稿")

  assert.deepEqual(result, {
    authoritative: false,
    settle: true,
    text: "实时草稿",
  })
})
