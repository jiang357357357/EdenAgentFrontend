import assert from "node:assert/strict"
import test from "node:test"

import {
  messageGroupPosition,
  messageRenderKey,
  messagesShareAssistantGroup,
  shouldShowAssistantThinkingFallback,
  shouldShowOrganizingReply,
} from "../src/lib/message-grouping.ts"

function message(id, role, runID, assistantID = 1) {
  return {
    id,
    role,
    runID,
    content: "",
    timestamp: "12:00",
    speaker: role === "assistant" ? { assistantID, assistantName: `助手${assistantID}` } : undefined,
  }
}

test("groups consecutive tool-loop messages from the same run and assistant", () => {
  const messages = [
    message("user", "user"),
    message("runtime", "assistant", "run-1"),
    message("tool", "assistant", "run-1"),
    message("final", "assistant", "run-1"),
  ]

  assert.equal(messageGroupPosition(messages, 1), "first")
  assert.equal(messageGroupPosition(messages, 2), "middle")
  assert.equal(messageGroupPosition(messages, 3), "last")
})

test("keeps the first assistant render key stable when a shell becomes a server message", () => {
  const user = message("user-1", "user")
  const shell = message("understanding-shell", "assistant")
  const serverMessage = message("server-message", "assistant", "run-1", 1)

  assert.equal(messageRenderKey([user, shell], 1), "assistant-turn:user-1")
  assert.equal(messageRenderKey([user, serverMessage], 1), "assistant-turn:user-1")
})

test("does not group different runs or different assistants", () => {
  const first = message("first", "assistant", "run-1", 1)
  const nextRun = message("next-run", "assistant", "run-2", 1)
  const nextAssistant = message("next-assistant", "assistant", "run-1", 2)

  assert.equal(messagesShareAssistantGroup(first, nextRun), false)
  assert.equal(messagesShareAssistantGroup(first, nextAssistant), false)
  assert.equal(messageGroupPosition([first, nextRun], 0), "single")
})

test("a user message always breaks an assistant group", () => {
  const messages = [
    message("first", "assistant", "run-1"),
    message("user", "user"),
    message("last", "assistant", "run-1"),
  ]

  assert.equal(messageGroupPosition(messages, 0), "single")
  assert.equal(messageGroupPosition(messages, 2), "single")
})

test("groups consecutive legacy messages when runID was not loaded", () => {
  const messages = [
    message("runtime", "assistant", undefined, 1),
    message("tool", "assistant", undefined, 1),
    message("final", "assistant", undefined, 1),
  ]

  assert.equal(messageGroupPosition(messages, 0), "first")
  assert.equal(messageGroupPosition(messages, 1), "middle")
  assert.equal(messageGroupPosition(messages, 2), "last")
})

test("keeps a temporary assistant shell grouped until its metadata arrives", () => {
  const known = message("known", "assistant", "run-1", 1)
  const pending = {
    ...message("pending", "assistant"),
    runID: undefined,
    speaker: undefined,
  }

  assert.equal(messagesShareAssistantGroup(known, pending), true)
  assert.equal(messageGroupPosition([known, pending], 0), "first")
  assert.equal(messageGroupPosition([known, pending], 1), "last")
})

test("only a genuinely empty streaming message needs the organizing placeholder", () => {
  const empty = { ...message("empty", "assistant", "run-1"), isStreaming: true }

  assert.equal(shouldShowOrganizingReply(empty), true)
  assert.equal(
    shouldShowOrganizingReply({
      ...empty,
      segments: [{ id: "runtime", type: "runtimeTrace", content: "正在读取配置", state: "streaming" }],
    }),
    false,
  )
  assert.equal(shouldShowOrganizingReply({ ...empty, thinking: "正在分析" }), false)
  assert.equal(shouldShowOrganizingReply({ ...empty, toolCalls: [{ id: "tool" }] }), false)
})

test("does not flash a thinking avatar between message completion and session idle", () => {
  assert.equal(
    shouldShowAssistantThinkingFallback({
      isThinking: true,
      hasStreamingAssistantMessage: false,
      hasAssistantReplyAfterLastUser: false,
      hasDirectorRun: false,
    }),
    true,
  )

  assert.equal(
    shouldShowAssistantThinkingFallback({
      isThinking: true,
      hasStreamingAssistantMessage: false,
      hasAssistantReplyAfterLastUser: true,
      hasDirectorRun: false,
    }),
    false,
  )

  assert.equal(
    shouldShowAssistantThinkingFallback({
      isThinking: false,
      hasStreamingAssistantMessage: false,
      hasAssistantReplyAfterLastUser: true,
      hasDirectorRun: false,
    }),
    false,
  )
})
