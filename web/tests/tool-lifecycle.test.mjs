import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
const client = await vite.ssrLoadModule("/src/lib/agent-client.ts")
const reducer = await vite.ssrLoadModule("/src/lib/session-reducer.ts")

after(async () => {
  await vite.close()
})

function event(id, eventType, payload, seq) {
  return {
    id,
    sessionId: "session-1",
    turnId: "turn-1",
    seq: BigInt(seq),
    eventType,
    payload,
    createdAt: BigInt(1_000 + seq),
  }
}

function assistantEvent(id = "assistant-end", eventType = "agent.message_end") {
  return event(id, eventType, {
    message: {
      role: "assistant",
      model: "test-model",
      provider: "test-provider",
      timestamp: 1_000,
      content: [{
        type: "toolCall",
        id: "call-1",
        name: "switch_character_action",
        arguments: { "立绘动作": "说话", "立绘动效": "无", "表情符号": "无" },
      }],
    },
  }, eventType === "agent.message_start" ? 1 : 2)
}

function resultEvent({ code, message = "ok", success = true } = {}) {
  return event("tool-result", "agent.message_end", {
    message: {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "switch_character_action",
      content: [{ type: "text", text: message }],
      details: { applied: success },
      success,
      isError: !success,
      ...(code ? { error: { code, message, retryable: false } } : {}),
      timestamp: 1_010,
    },
  }, 3)
}

test("historical tool results complete the original tool card and retain its input", () => {
  const messages = client.projectMessageEvents([assistantEvent(), resultEvent()])

  assert.equal(messages.length, 1)
  const tool = messages[0].parts[0]
  assert.equal(tool.id, "call-1")
  assert.equal(tool.state.status, "completed")
  assert.deepEqual(tool.state.input, { "立绘动作": "说话", "立绘动效": "无", "表情符号": "无" })
  assert.equal(tool.state.output, "ok")
})

test("tool failures distinguish ordinary errors from user aborts", () => {
  const failed = client.projectMessageEvents([
    assistantEvent("failed-assistant"),
    resultEvent({ code: "tool_failed", message: "failed", success: false }),
  ])[0].parts[0]
  const aborted = client.projectMessageEvents([
    assistantEvent("aborted-assistant"),
    resultEvent({ code: "aborted", message: "Operation aborted", success: false }),
  ])[0].parts[0]

  assert.equal(failed.state.status, "error")
  assert.equal(failed.state.errorCode, "tool_failed")
  assert.equal(aborted.state.status, "aborted")
  assert.equal(aborted.state.errorCode, "aborted")
})

test("live completion updates the originating assistant message before the session becomes idle", () => {
  const project = client.createSessionEventProjector()
  let state = reducer.runtimeReducer(reducer.initialRuntimeState, reducer.hydrateSessionList([{
    id: "session-1",
    title: "tool lifecycle",
    time: { created: 1, updated: 1 },
  }]))

  const events = [
    assistantEvent("assistant-start", "agent.message_start"),
    assistantEvent(),
    resultEvent(),
    event("turn-completed", "turn.completed", {}, 4),
  ]
  for (const source of events) {
    for (const update of project(source)) {
      state = reducer.runtimeReducer(state, reducer.applyRuntimeEvent(update))
    }
  }

  const tool = state.sessions["session-1"].messages["assistant-start"].parts["call-1"]
  assert.equal(state.sessions["session-1"].status, "idle")
  assert.equal(tool.state.status, "completed")
  assert.deepEqual(tool.state.input, { "立绘动作": "说话", "立绘动效": "无", "表情符号": "无" })
  assert.equal(tool.state.output, "ok")
})

test("streamed text stays incomplete until agent.message_end", () => {
  const project = client.createSessionEventProjector()
  let state = reducer.runtimeReducer(reducer.initialRuntimeState, reducer.hydrateSessionList([{
    id: "session-1",
    title: "stream completion",
    time: { created: 1, updated: 1 },
  }]))
  const textEvent = (id, eventType, text, seq) => event(id, eventType, {
    message: {
      role: "assistant",
      model: "test-model",
      provider: "test-provider",
      timestamp: 1_000,
      content: [{ type: "text", text }],
    },
  }, seq)
  const apply = (source) => {
    for (const update of project(source)) {
      state = reducer.runtimeReducer(state, reducer.applyRuntimeEvent(update))
    }
  }

  apply(textEvent("text-start", "agent.message_start", "你", 1))
  apply(textEvent("text-update", "agent.message_update", "你好，老师", 2))
  let part = state.sessions["session-1"].messages["text-start"].parts["text-start-part-0"]
  assert.equal(part.text, "你好，老师")
  assert.equal(part.done, false)

  apply(textEvent("text-end", "agent.message_end", "你好，老师。", 3))
  part = state.sessions["session-1"].messages["text-start"].parts["text-start-part-0"]
  assert.equal(part.text, "你好，老师。")
  assert.equal(part.done, true)
})
