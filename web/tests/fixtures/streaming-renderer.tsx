import { Profiler, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { TextSegment } from "../../src/components/chat/message/TextSegment"
import { ThinkingBlock } from "../../src/components/chat/message/ThinkingBlock"
import { selectActiveSession, selectSessions } from "../../src/lib/session-selectors"
import * as tokenUsage from "../../src/lib/token-usage"
import type { RuntimeState } from "../../src/types"

const nativeNow = performance.now.bind(performance)
let clock = 0, frameID = 0
const frames = new Map<number, FrameRequestCallback>()
Object.defineProperty(performance, "now", { value: () => clock })
window.requestAnimationFrame = (callback) => { frames.set(++frameID, callback); return frameID }
window.cancelAnimationFrame = (id) => { frames.delete(id) }
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))

async function advanceFrame() {
  clock += 1_000 / 60
  const callbacks = [...frames.values()]
  frames.clear()
  flushSync(() => callbacks.forEach(callback => callback(clock)))
  await settle()
}

function projectionBenchmark() {
  const history = Array.from({ length: 40 }, (_, i) => {
    const id = `history-${i}`
    return { id, sessionID: "active", role: "assistant" as const, createdAt: 1_000, completedAt: 2_000,
      partOrder: [id], parts: { [id]: { id, type: "tool" as const, tool: "read_file", state: {
        status: "completed" as const, input: { path: "fixture.txt" }, output: "测试资料与工具结果 abc\n".repeat(2_000),
      } } } }
  })
  const live = { id: "live", sessionID: "active", role: "assistant" as const, createdAt: 3_000,
    partOrder: ["live"], parts: { live: { id: "live", type: "text" as const, text: "回复", done: false } } }
  const active = { id: "active", title: "性能夹具", status: "busy" as const, hydrated: true,
    loadingOlderMessages: false, hasMoreMessages: false, messageOrder: [...history.map(m => m.id), "live"],
    messages: Object.fromEntries([...history, live].map(m => [m.id, m])) }
  let state: RuntimeState = { activeSessionId: "active", sessions: { active }, sessionOrder: ["active"],
    permissions: {}, permissionOrder: [], questions: {}, questionOrder: [], connectionState: "connected" }
  const first = selectActiveSession(state)!
  const cachedEstimator = "createContextTokenEstimator" in tokenUsage
    ? tokenUsage.createContextTokenEstimator() : undefined
  let unchangedViews = 0, matchedSelectors = 0, totalTokens = 0
  const started = nativeNow()
  for (let index = 0; index < 60; index += 1) {
    const session = state.sessions.active, message = session.messages.live
    const text = message.parts.live as typeof live.parts.live
    state = { ...state, sessions: { active: { ...session, messages: { ...session.messages,
      live: { ...message, parts: { live: { ...text, text: `${text.text}新内容` } } } } } } }
    const listed = selectSessions(state), selected = selectActiveSession(state)!
    if (selected.messages[0] === first.messages[0]) unchangedViews += 1
    if (listed[0] === selected) matchedSelectors += 1
    // This is the ChatPage path: old code eagerly computed a fallback even
    // when an authoritative server count was already available.
    totalTokens = cachedEstimator ? cachedEstimator(selected.messages, 12_000)
      : (tokenUsage.estimateConversationTokens(selected.messages), 12_000)
  }
  return { updates: 60, durationMs: Math.round(nativeNow() - started), unchangedViews, matchedSelectors, totalTokens }
}

async function rendererBenchmark() {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  let text = "# 渲染测试\n\n" + "这是 **已输出的内容**，需要保留原有段落和 DOM 节点。\n\n".repeat(140)
  let renders = 0, reveals = 0, addedElements = 0, renderCPUms = 0
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node instanceof Element) addedElements += 1 + node.querySelectorAll("*").length
    }
  })
  const reveal = () => { reveals += 1 }
  const draw = (active: boolean, key = "benchmark") => flushSync(() => root.render(
    <StrictMode><Profiler id="reply" onRender={() => { renders += 1 }}><TextSegment
      segment={{ id: key, type: "text", content: text, state: active ? "streaming" : "done" }}
      isUser={false} messageId={key} isMessageStreaming={active} onTextReveal={reveal}
      ttsMode="none" speechClips={{}} speechPaused={false}
    /></Profiler></StrictMode>,
  ))
  draw(false)
  await settle()
  const paragraph = host.querySelector("p")
  observer.observe(host, { childList: true, subtree: true })
  renders = 0
  for (let index = 0; index < 120; index += 1) {
    const started = nativeNow()
    if (index % 6 === 0) { text += "新增文字，用于真实 React 流式渲染。"; draw(true) }
    renderCPUms += nativeNow() - started
    const frameStarted = nativeNow()
    clock += 1_000 / 60
    const callbacks = [...frames.values()]
    frames.clear()
    flushSync(() => callbacks.forEach(callback => callback(clock)))
    renderCPUms += nativeNow() - frameStarted
    await settle()
  }
  const result = { virtualSeconds: 2, commits: renders, reveals, addedElements,
    renderCPUms: Math.round(renderCPUms), stableParagraph: host.querySelector("p") === paragraph }
  draw(false)
  const completionImmediate = host.querySelector(".markdown-body")?.textContent?.includes("新增文字") === true
    && host.querySelector(".markdown-body")?.textContent?.endsWith("新增文字，用于真实 React 流式渲染。") === true
  text = "重置后的内容"
  draw(true)
  const resetImmediate = host.querySelector(".markdown-body")?.textContent === text
  draw(false)
  text = "另一个会话的内容"
  draw(false, "second-session")
  const sessionIsolated = host.querySelector(".markdown-body")?.textContent === text
  flushSync(() => root.unmount())
  observer.disconnect()
  host.remove()
  const framesAfterUnmount = frames.size

  const thinkingHost = document.createElement("div")
  document.body.append(thinkingHost)
  const thinkingRoot = createRoot(thinkingHost)
  flushSync(() => thinkingRoot.render(<StrictMode><ThinkingBlock content={"思考内容".repeat(1_000)}
    state="streaming" cacheKey="collapsed-thinking" /></StrictMode>))
  await advanceFrame()
  const collapsedThinkingFrames = frames.size
  flushSync(() => thinkingRoot.unmount())
  thinkingHost.remove()
  return { ...result, completionImmediate, resetImmediate, sessionIsolated, framesAfterUnmount, collapsedThinkingFrames }
}

Object.assign(window, { runStreamingBenchmark: async () => ({
  projection: projectionBenchmark(), renderer: await rendererBenchmark(),
}) })
