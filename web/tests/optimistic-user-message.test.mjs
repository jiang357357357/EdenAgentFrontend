import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })
const reducer = await vite.ssrLoadModule("/src/lib/session-reducer.ts")
const selectors = await vite.ssrLoadModule("/src/lib/session-selectors.ts")

after(async () => {
  await vite.close()
})

const {
  acceptLocalUserMessage,
  applyRuntimeEvent,
  failLocalUserMessage,
  hydrateSessionList,
  hydrateSessionMessages,
  initialRuntimeState,
  pushLocalUserMessage,
  runtimeReducer,
  setSessionStatus,
} = reducer
const { selectSessions } = selectors

const sessionID = "session-optimistic"

function createState() {
  return runtimeReducer(initialRuntimeState, hydrateSessionList([{
    id: sessionID,
    title: "测试会话",
    runtimeStatus: "idle",
    participants: [],
    time: { created: 1_000, updated: 1_000 },
  }]))
}

function textMessage(id, text, createdAt) {
  return {
    info: { id, role: "user", time: { created: createdAt } },
    parts: [{
      id: `${id}-text`,
      messageID: id,
      sessionID,
      type: "text",
      text,
      time: { start: createdAt, end: createdAt },
    }],
  }
}

test("renders a submitted user message immediately and marks it queued after RPC acceptance", () => {
  const action = pushLocalUserMessage(sessionID, "立即显示", [], { createdAt: 2_000 })
  let state = runtimeReducer(createState(), action)
  let message = state.sessions[sessionID].messages[action.messageID]

  assert.equal(state.sessions[sessionID].status, "busy")
  assert.equal(message.localOnly, true)
  assert.equal(message.deliveryState, "sending")
  assert.equal(message.parts[message.partOrder[0]].text, "立即显示")
  assert.equal(selectSessions(state)[0].messages[0].content, "立即显示")
  assert.equal(selectSessions(state)[0].messages[0].deliveryState, "sending")

  state = runtimeReducer(state, acceptLocalUserMessage(sessionID, action.messageID))
  message = state.sessions[sessionID].messages[action.messageID]
  assert.equal(message.deliveryState, "queued")
})

test("keeps a failed message visible with its error and releases a normal turn", () => {
  const action = pushLocalUserMessage(sessionID, "不能丢失", [], { createdAt: 2_000 })
  let state = runtimeReducer(createState(), action)
  state = runtimeReducer(state, failLocalUserMessage(sessionID, action.messageID, "连接已断开"))

  const runtimeMessage = state.sessions[sessionID].messages[action.messageID]
  const visibleMessage = selectSessions(state)[0].messages[0]
  assert.equal(state.sessions[sessionID].status, "idle")
  assert.equal(runtimeMessage.deliveryState, "failed")
  assert.equal(visibleMessage.error?.title, "消息发送失败")
  assert.equal(visibleMessage.error?.message, "连接已断开")
})

test("a failed follow-up does not incorrectly mark the running session idle", () => {
  let state = runtimeReducer(createState(), setSessionStatus(sessionID, "busy"))
  const action = pushLocalUserMessage(sessionID, "下一条", [], { createdAt: 2_000, followUp: true })
  state = runtimeReducer(state, action)
  state = runtimeReducer(
    state,
    failLocalUserMessage(sessionID, action.messageID, "排队失败", { followUp: true }),
  )

  assert.equal(state.sessions[sessionID].status, "busy")
  assert.equal(state.sessions[sessionID].messages[action.messageID].deliveryState, "failed")
})

test("server acknowledgement takes over the optimistic render key without a duplicate bubble", () => {
  const action = pushLocalUserMessage(sessionID, "交给服务端", [], { createdAt: 2_000 })
  let state = runtimeReducer(createState(), action)
  const renderKey = state.sessions[sessionID].messages[action.messageID].renderKey

  state = runtimeReducer(state, applyRuntimeEvent({
    type: "message.updated",
    properties: {
      sessionID,
      info: { id: "server-user", role: "user", time: { created: 2_010 } },
    },
  }))

  assert.deepEqual(state.sessions[sessionID].messageOrder, ["server-user"])
  assert.equal(state.sessions[sessionID].messages["server-user"].renderKey, renderKey)
  assert.equal(state.sessions[sessionID].messages["server-user"].localOnly, false)
  assert.equal(state.sessions[sessionID].messages["server-user"].deliveryState, undefined)

  state = runtimeReducer(state, applyRuntimeEvent({
    type: "message.part.updated",
    properties: {
      sessionID,
      part: {
        id: "server-user-text",
        messageID: "server-user",
        sessionID,
        type: "text",
        text: "交给服务端",
        time: { start: 2_010, end: 2_010 },
      },
    },
  }))

  assert.deepEqual(state.sessions[sessionID].messageOrder, ["server-user"])
  assert.equal(selectSessions(state)[0].messages[0].content, "交给服务端")
})

test("message hydration preserves pending turns and reconciles matching server records one-to-one", () => {
  const first = pushLocalUserMessage(sessionID, "重复内容", [], { createdAt: 2_000 })
  const second = pushLocalUserMessage(sessionID, "重复内容", [], { createdAt: 2_020 })
  let state = runtimeReducer(createState(), first)
  state = runtimeReducer(state, second)

  state = runtimeReducer(state, hydrateSessionMessages(sessionID, {
    items: [],
    hasMore: false,
  }))
  assert.deepEqual(state.sessions[sessionID].messageOrder, [first.messageID, second.messageID])

  state = runtimeReducer(state, hydrateSessionMessages(sessionID, {
    items: [textMessage("server-first", "重复内容", 2_010)],
    hasMore: false,
  }))

  assert.deepEqual(state.sessions[sessionID].messageOrder, ["server-first", second.messageID])
  assert.equal(state.sessions[sessionID].messages[second.messageID].localOnly, true)
  assert.equal(selectSessions(state)[0].messages.length, 2)
})

test("failed optimistic turns survive hydration instead of attaching to unrelated server history", () => {
  const action = pushLocalUserMessage(sessionID, "保留失败", [], { createdAt: 2_000 })
  let state = runtimeReducer(createState(), action)
  state = runtimeReducer(state, failLocalUserMessage(sessionID, action.messageID, "请求失败"))
  state = runtimeReducer(state, hydrateSessionMessages(sessionID, {
    items: [textMessage("old-server-user", "保留失败", 2_010)],
    hasMore: false,
  }))

  assert.deepEqual(state.sessions[sessionID].messageOrder, ["old-server-user", action.messageID])
  assert.equal(state.sessions[sessionID].messages[action.messageID].deliveryState, "failed")
})

test("uploaded images reconcile after the server replaces their local data URLs", () => {
  const action = pushLocalUserMessage(sessionID, "看这张图", [{
    url: "data:image/png;base64,local-preview",
    filename: "screen.png",
    mime: "image/png",
  }], { createdAt: 2_000 })
  let state = runtimeReducer(createState(), action)
  state = runtimeReducer(state, hydrateSessionMessages(sessionID, {
    items: [{
      info: { id: "server-image", role: "user", time: { created: 2_010 } },
      parts: [
        {
          id: "server-image-text",
          messageID: "server-image",
          sessionID,
          type: "text",
          text: "看这张图",
          time: { start: 2_010, end: 2_010 },
        },
        {
          id: "server-image-file",
          messageID: "server-image",
          sessionID,
          type: "file",
          url: "/blob/server-image",
          filename: "screen.png",
          mime: "image/png",
        },
      ],
    }],
    hasMore: false,
  }))

  assert.deepEqual(state.sessions[sessionID].messageOrder, ["server-image"])
  assert.equal(selectSessions(state)[0].messages[0].images[0], "/blob/server-image")
})
