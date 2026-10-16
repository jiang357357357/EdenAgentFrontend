import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { Sidebar } from "../../src/components/layout/Sidebar"
import { AllSessionsPage } from "../../src/pages/all-sessions/AllSessionsPage"
import type { Session } from "../../src/types"
import { initialRuntimeState, runtimeReducer, hydrateSessionList, applyRuntimeEvent } from "../../src/lib/session-reducer"
import { createSessionSummarySelector } from "../../src/lib/session-summary-selector"

declare global {
  interface Window {
    sessionMenuStore: Map<string, { id: string; title: string; archived: boolean; status: "active"; purpose: "user_chat";
      sourceChannel: "app"; createdAt: number; updatedAt: number }>
    prepareSessionMenu(): Promise<void>
    runSessionMenuTests(): Promise<Record<string, boolean>>
  }
}

const host = document.createElement("div")
host.style.cssText = "height:100vh;display:flex"
document.body.append(host)
const root = createRoot(host)
const wait = () => new Promise<void>(resolve => setTimeout(resolve, 25))
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const until = async (condition: () => boolean) => {
  const end = performance.now() + 2500
  while (!condition() && performance.now() < end) await wait()
  assert(condition(), "Timed out waiting for the UI")
}
window.sessionMenuStore = new Map(["first", "second", "third"].map((id, index) => [id,
  { id, title: `会话 ${index + 1}`, archived: false, status: "active", purpose: "user_chat", sourceChannel: "app", createdAt: 1000, updatedAt: 2000 }]))
let renamed = "", deleted = "", selected = "", failArchive = false
const noop = () => {}
const navigation = { onOpenParticipants: noop, onOpenDutyAssistant: noop, onOpenSelfAwake: noop,
  onOpenMemo: noop, onOpenSkills: noop, onOpenConnectors: noop, onOpenConfiguration: noop, onOpenSettings: noop }
const sessions = (): Session[] => [...window.sessionMenuStore.values()].map(item => ({ ...item, date: "今天", messages: [] }))
const archive = async (id: string, value: boolean) => {
  if (failArchive) throw new Error("保存归档失败，请重试。")
  window.sessionMenuStore.get(id)!.archived = value
}
function renderSidebar() {
  flushSync(() => root.render(<Sidebar {...navigation} sessions={sessions()} activeId="first" activity="sessions"
    onSelect={id => { selected = id }} onArchive={async (id, value) => { await archive(id, value); renderSidebar() }}
    onRename={async (id, title) => { renamed = id; window.sessionMenuStore.get(id)!.title = title; renderSidebar() }}
    onDelete={async id => { deleted = id; window.sessionMenuStore.delete(id); renderSidebar() }}
    onNewSession={noop} onOpenAllSessions={noop} onOpenFile={noop} onWorkspaceChanged={noop}
    onOpenSharedWorkspace={noop} onActivityChange={noop} />))
}
const button = (id: string) => host.querySelector<HTMLButtonElement>(`[data-session-select="${id}"]`)!
const menu = () => document.querySelector<HTMLElement>('[role="menu"]')
const item = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(node => node.textContent === text)!
async function open(id = "second") {
  button(id).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2,
    clientX: innerWidth - 2, clientY: innerHeight - 2 }))
  await until(() => Boolean(menu()))
}

window.prepareSessionMenu = async () => {
  const summaries = createSessionSummarySelector()
  let state = runtimeReducer(initialRuntimeState, hydrateSessionList([{ id: "source", title: "状态链路", archived: false,
    runtimeStatus: "busy", time: { created: 1, updated: 100 } }]))
  const before = summaries(state)[0]
  state = runtimeReducer(state, applyRuntimeEvent({ type: "session.archive_updated",
    properties: { sessionID: "source", archived: true, updatedAt: 200 } }))
  assert(summaries(state)[0].archived && summaries(state)[0] !== before, "archive invalidates the actual sidebar summary cache")
  state = runtimeReducer(state, hydrateSessionList([{ id: "source", title: "状态链路", archived: false, time: { created: 1, updated: 100 } }]))
  assert(summaries(state)[0].archived && state.sessions.source.status === "busy", "older hydration cannot undo archive or stop work")
  state = runtimeReducer(state, applyRuntimeEvent({ type: "session.archive_updated",
    properties: { sessionID: "source", archived: false, updatedAt: 300 } }))
  assert(!summaries(state)[0].archived, "restore reaches the actual sidebar state pipeline")
  renderSidebar(); await wait(); await open()
  assert([...host.querySelectorAll('[data-session-row]')].every(row => row.querySelectorAll("button").length === 1),
    "session rows only expose selection; edit and delete are in the context menu")
  assert([...document.querySelectorAll('[role="menuitem"]')].map(node => node.textContent).join(",") === "编辑,归档,删除", "three menu actions")
  const rect = menu()!.getBoundingClientRect()
  assert(rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, "menu fits viewport")
  assert(selected === "", "right-click does not select or change the active session")
}

window.runSessionMenuTests = async () => {
  const results: Record<string, boolean> = { menuAndViewport: true }
  item("编辑").click()
  await until(() => Boolean(document.querySelector('dialog[open]')))
  const input = document.querySelector<HTMLInputElement>('#session-title-input')!
  assert(input.value === "会话 2", "edit targets right-clicked session, not active session")
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "编辑后的会话")
  input.dispatchEvent(new Event("input", { bubbles: true })); await wait()
  document.querySelector<HTMLFormElement>('dialog form')!.requestSubmit()
  await until(() => !document.querySelector('dialog[open]'))
  assert(renamed === "second" && button("second").title === "编辑后的会话", "edited title saved")
  results.editCorrectTarget = true

  await open(); failArchive = true; item("归档").click()
  await until(() => Boolean(menu()?.querySelector('[role="alert"]')))
  assert(Boolean(button("second")) && !window.sessionMenuStore.get("second")!.archived, "failed archive stays visible")
  failArchive = false; item("归档").click()
  await until(() => !button("second") && !menu())
  assert(window.sessionMenuStore.get("second")!.archived, "archive is confirmed by backend state")
  results.archiveFailureAndSuccess = true

  flushSync(() => root.render(<AllSessionsPage origin="local" onBack={noop} navigation={navigation} onArchive={archive} />))
  await until(() => host.textContent!.includes("编辑后的会话"))
  const filter = host.querySelector<HTMLSelectElement>('[aria-label="筛选归档状态"]')!
  filter.value = "archived"; filter.dispatchEvent(new Event("change", { bubbles: true }))
  await until(() => [...host.querySelectorAll('button')].some(node => node.textContent === "取消归档"))
  assert(![...host.querySelectorAll('aside button')].some(node => node.textContent?.includes("会话 1")), "archive-only filter")
  ;[...host.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === "取消归档")!.click()
  await until(() => !window.sessionMenuStore.get("second")!.archived)
  renderSidebar(); await wait()
  assert(Boolean(button("second")) && !menu(), "restored session returns without an old popup")
  results.filterAndRestore = true

  button("second").focus()
  button("second").dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "F10", shiftKey: true }))
  await until(() => Boolean(menu()))
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowDown" }))
  assert(document.activeElement?.textContent === "归档", "menu keyboard navigation")
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }))
  await until(() => !menu())
  assert(document.activeElement === button("second"), "escape restores focus")
  await open(); document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
  await until(() => !menu())
  results.keyboardAndOutsideClose = true

  const confirm = window.confirm
  window.confirm = () => false; await open(); item("删除").click(); await until(() => !menu())
  assert(!deleted && Boolean(button("second")), "delete cancellation keeps history")
  window.confirm = () => true; await open(); item("删除").click()
  await until(() => !button("second"))
  window.confirm = confirm
  assert(deleted === "second" && Boolean(button("first")), "delete targets clicked session")
  results.deleteConfirmationAndTarget = true
  return results
}
