import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { Sidebar } from "../../src/components/layout/Sidebar"
import { useSessionHistoryMaintenance } from "../../src/hooks/useSessionHistoryMaintenance"
import { initialRuntimeState, runtimeReducer, type RuntimeAction } from "../../src/lib/session-reducer"
import type { RuntimeState, Session } from "../../src/types"

declare global {
  interface Window {
    historyHarness: { read(id: string): Promise<unknown> }
    runHistorySidebarTests(): Promise<Record<string, unknown>>
  }
}

const host = document.createElement("div")
host.style.cssText = "height:700px;width:360px;display:flex"
document.body.append(host)
const root = createRoot(host)
const wait = () => new Promise<void>(resolve => setTimeout(resolve, 20))
const until = async (condition: () => boolean) => {
  const deadline = performance.now() + 1000
  while (!condition() && performance.now() < deadline) await wait()
}
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const render = (element: React.ReactNode) => flushSync(() => root.render(element))
const stableGuard = () => () => true
let externalState: RuntimeState = initialRuntimeState
let externalEpoch = 0, requests = 0, applied = 0
let resolvePage: ((value: unknown) => void) | undefined
window.historyHarness = { read: async () => { requests++; return new Promise(resolve => { resolvePage = resolve }) } }

function fixtureState(count = 251): RuntimeState {
  const messages = Array.from({ length: count }, (_, index) => {
    const id = `message-${index}`
    return { id, role: "assistant" as const, sessionID: "active", completedAt: 2, createdAt: 1,
      partOrder: [id], parts: { [id]: { id, type: "text" as const, text: "fixture", done: true } } }
  })
  return { ...initialRuntimeState, connectionState: "connected", activeSessionId: "active", sessionOrder: ["active"],
    sessions: { active: { id: "active", title: "fixture", status: "idle", hydrated: true, hasMoreMessages: true,
      loadingOlderMessages: false, messages: Object.fromEntries(messages.map(item => [item.id, item])), messageOrder: messages.map(item => item.id) } } }
}
function recentPage(large = false) {
  return { items: Array.from({ length: large ? 1 : 50 }, (_, index) => ({
    info: { id: `recent-${index}`, sessionID: "active", role: "assistant", time: { created: index + 1, completed: index + 2 } },
    parts: [{ id: `part-${index}`, type: "text", text: large ? "x".repeat(9 * 1024 * 1024) : "fixture", time: { start: 1, end: 2 } }],
  })), hasMore: true, nextCursor: "durable-cursor" }
}
const dispatch = (action: RuntimeAction) => {
  if (action.type === "hydrateMessages") applied++
  externalState = runtimeReducer(externalState, action)
  queueMicrotask(() => render(<Maintenance />))
}
function Maintenance() {
  useSessionHistoryMaintenance(externalState, true, externalEpoch, dispatch, stableGuard)
  return <div>maintenance fixture</div>
}

export async function runHistorySidebarTests() {
  const results: Record<string, unknown> = {}
  externalState = fixtureState()
  render(<Maintenance />)
  await wait()
  assert(requests === 1, "recent page starts once")
  externalState = { ...externalState, connectionError: "unrelated state update" }
  render(<Maintenance />)
  resolvePage!(recentPage())
  await wait(); await wait()
  assert(applied === 1 && externalState.sessions.active.messageOrder.length === 50, "unrelated renders cannot cancel successful maintenance")
  assert(externalState.sessions.active.messageCursor === "durable-cursor", "server cursor preserved")
  results.restoredRecentPage = true

  externalEpoch++
  externalState = fixtureState()
  externalState.sessions.active.historyBrowsing = true
  render(<Maintenance />)
  await wait()
  assert(requests === 1, "reading history stays untouched")
  externalState = { ...externalState, sessions: { active: { ...externalState.sessions.active, historyBrowsing: false } } }
  render(<Maintenance />)
  await wait()
  assert(requests === 2, "returning to latest starts maintenance")
  externalState = { ...externalState, activeSessionId: undefined }
  render(<Maintenance />)
  resolvePage!(recentPage())
  await wait(); await wait()
  assert(applied === 1, "late page cannot replace an abandoned selection")
  externalState = { ...externalState, activeSessionId: "active" }
  render(<Maintenance />)
  await wait()
  assert(requests === 3, "discarded request can retry when returning")
  externalEpoch++
  externalState = fixtureState(1)
  render(<Maintenance />)
  resolvePage!(recentPage())
  await wait(); await wait()
  assert(externalState.sessions.active.messageOrder.length === 1 && applied === 1, "old world/account response discarded")
  results.browsingAndLateResponsesSafe = true

  externalEpoch++
  externalState = fixtureState()
  render(<Maintenance />)
  await wait()
  resolvePage!(recentPage(true))
  await wait(); await wait(); await wait()
  assert(requests === 4, "one oversized message does not create a restore loop")
  assert(externalState.sessions.active.messageOrder.length === 1, "oversized message remains readable")
  results.oversizedPageSettles = true

  externalEpoch++
  externalState = fixtureState()
  render(<Maintenance />)
  await wait()
  const reselectionRequests = requests, reselectionApplied = applied
  externalState = { ...externalState, activeSessionId: undefined }
  render(<Maintenance />)
  externalState = { ...externalState, activeSessionId: "active" }
  render(<Maintenance />)
  resolvePage!(recentPage())
  await until(() => requests === reselectionRequests + 1)
  assert(applied === reselectionApplied && requests === reselectionRequests + 1, "leaving and returning rejects the previous request and retries")
  resolvePage!(recentPage())
  await until(() => applied === reselectionApplied + 1)
  assert(applied === reselectionApplied + 1, "fresh selection can restore")

  externalEpoch++
  externalState = fixtureState()
  render(<Maintenance />)
  await wait()
  const contentRequests = requests, contentApplied = applied
  externalState = runtimeReducer(externalState, { type: "event", event: { type: "message.part.delta", properties: {
    sessionID: "active", messageID: "message-250", partID: "message-250", field: "text", delta: "late content" } } })
  render(<Maintenance />)
  resolvePage!(recentPage())
  await until(() => requests === contentRequests + 1)
  assert(applied === contentApplied && requests === contentRequests + 1, "same message IDs with changed content reject a stale page")
  const updatedPart = externalState.sessions.active.messages["message-250"].parts["message-250"]
  assert("text" in updatedPart && typeof updatedPart.text === "string" && updatedPart.text.endsWith("late content"), "new content retained")
  resolvePage!(recentPage())
  await until(() => applied === contentApplied + 1)
  assert(applied === contentApplied + 1, "stable content can restore")
  results.staleContentAndReselectionSafe = true

  render(<div />)
  const sessions: Session[] = Array.from({ length: 1000 }, (_, index) => ({ id: `session-${index}`,
    title: `会话 ${index}`, date: "今天", updatedAt: 0, messages: [] }))
  let selected = "", deleted = "", renamed = ""
  const noop = () => {}
  const props = { sessions, activeId: "session-0", activity: "sessions" as const,
    onSelect: (id: string) => { selected = id }, onDelete: (id: string) => { deleted = id },
    onRename: async (id: string) => { renamed = id }, onArchive: async () => {}, onNewSession: noop, onOpenParticipants: noop,
    onOpenDutyAssistant: noop, onOpenSelfAwake: noop, onOpenAllSessions: noop, onOpenMemo: noop,
    onOpenSkills: noop, onOpenConnectors: noop, onOpenConfiguration: noop, onOpenSettings: noop,
    onOpenFile: noop, onWorkspaceChanged: noop, onOpenSharedWorkspace: noop, onActivityChange: noop }
  render(<Sidebar {...props} />)
  await wait(); await wait()
  const viewport = host.querySelector<HTMLDivElement>("[data-virtual-session-list]")!
  const buttons = () => host.querySelectorAll<HTMLButtonElement>("button[data-session-select]")
  assert(buttons().length < 30, "1000 rows have a bounded visible window")
  assert(host.querySelectorAll("*").length < 600, "DOM stays bounded")
  const start = performance.now()
  for (let index = 0; index < 10; index++) render(<Sidebar {...props} sessions={[...sessions]} />)
  results.sidebar = { sessions: 1000, updates: 10, milliseconds: performance.now() - start,
    mountedSessions: buttons().length, domElements: host.querySelectorAll("*").length }
  viewport.scrollTop = viewport.scrollHeight
  viewport.dispatchEvent(new Event("scroll", { bubbles: true }))
  await until(() => Boolean(host.querySelector('button[data-session-select="session-999"]')))
  const last = host.querySelector<HTMLButtonElement>('button[data-session-select="session-999"]')!
  assert(last, `last row is reachable by scrolling: ${JSON.stringify({ top: viewport.scrollTop, height: viewport.clientHeight,
    total: viewport.scrollHeight, rows: [...buttons()].map(item => item.dataset.sessionSelect) })}`)
  last.click()
  assert(selected === "session-999", "selection routes the correct ID")
  last.focus()
  last.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Home" }))
  await wait(); await wait()
  assert((document.activeElement as HTMLElement).dataset.sessionSelect === "session-0", "Home moves focus to first session")
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" }))
  await wait(); await wait()
  assert((document.activeElement as HTMLElement).dataset.sessionSelect === "session-999", "End moves focus to last session")
  const confirm = window.confirm
  const openMenu = async () => {
    host.querySelector<HTMLButtonElement>('button[data-session-select="session-999"]')!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }))
    await until(() => Boolean(document.querySelector('[role="menu"]')))
  }
  const menuItem = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .find(item => item.textContent === text)!
  await openMenu()
  window.confirm = () => true
  menuItem("删除").click()
  await until(() => !document.querySelector('[role="menu"]'))
  window.confirm = confirm
  assert(deleted === "session-999", "delete routes the correct ID")
  await openMenu()
  menuItem("编辑").click()
  await wait()
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]")
  assert(dialog, "rename dialog opens for a virtual row")
  const input = dialog!.querySelector<HTMLInputElement>("input")!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "修改后的会话标题")
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await wait()
  dialog!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  await wait(); await wait()
  assert(renamed === "session-999", "rename saves the correct virtual row ID")
  render(<div />)
  render(<Sidebar {...props} />)
  await wait(); await wait()
  const search = host.querySelector<HTMLInputElement>('input[placeholder="搜索会话"]')!
  const setSearch = (value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, value)
    search.dispatchEvent(new Event("input", { bubbles: true }))
  }
  setSearch("999")
  await wait(); await wait()
  assert(buttons().length === 1 && buttons()[0].dataset.sessionSelect === "session-999", "filtering finds an offscreen session")
  setSearch("no matching fixture")
  await wait()
  assert(buttons().length === 0 && host.textContent?.includes("没有匹配的会话"), "empty search has no stale rows")
  setSearch("")
  await wait(); await wait()
  assert(buttons().length > 1 && buttons().length < 30, "clearing search restores the bounded list")
  results.sidebarActions = { scroll: true, keyboard: true, select: true, delete: true, rename: true, filter: true }
  return results
}

window.runHistorySidebarTests = runHistorySidebarTests
