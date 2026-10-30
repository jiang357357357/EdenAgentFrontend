import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { MessageFooter } from "../../src/components/chat/message/MessageFooter"
import { MessageBubble } from "../../src/components/chat/message/MessageBubble"
import { buildReplyActionGroups } from "../../src/lib/reply-action-groups"
import { messageGroupPosition } from "../../src/lib/message-grouping"
import type { MessageData } from "../../src/types"

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 30))
function check(condition: unknown, message: string) { if (!condition) throw new Error(message) }
function button(label: string, parent: ParentNode = document): HTMLButtonElement {
  const found = [...parent.querySelectorAll("button")].find(value => value.getAttribute("aria-label") === label || value.textContent?.trim() === label)
  if (!found) throw new Error(`Missing button: ${label}`)
  return found
}

async function runMessageFooterTests() {
  const host = document.createElement("div")
  host.className = "interface-dark"
  document.body.append(host)
  const root = createRoot(host)
  const writes: string[] = []
  let deleteCalls = 0, failCopy = false, failDelete = false
  let releaseDelete: () => void = () => {}
  let deletion = Promise.resolve()
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    async writeText(text: string) {
      if (failCopy) throw new Error("fixture clipboard unavailable")
      writes.push(text)
    },
  } })
  const remove = async () => {
    deleteCalls++
    if (failDelete) throw new Error("fixture deletion unavailable")
    await deletion
  }
  const draw = (key = "answer", disabled = false) => flushSync(() => root.render(<StrictMode>
    <div className="mx-auto mt-20 w-[min(44rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-6 text-text">
      <p className="mb-4">这是一条回答，用于验证复制及删除确认。</p>
      <MessageFooter key={key} durationMs={29300} text={"**回答正文**\n\n第二段"} onDelete={remove} deleteDisabled={disabled} />
    </div>
  </StrictMode>))
  draw(); await settle()
  const copy = button("复制回答")
  copy.click(); copy.click(); await settle()
  check(writes.length === 1 && writes[0] === "**回答正文**\n\n第二段", "Copy must use answer text exactly once")
  check(Boolean(document.querySelector('[aria-label="已复制"]')), "Copy success must be visible")

  button("删除回答").click(); await settle()
  let dialog = document.querySelector<HTMLDialogElement>("dialog")!
  check(dialog?.open && deleteCalls === 0, "Opening confirmation must not delete")
  check(dialog.contains(document.activeElement), "Confirmation must receive keyboard focus")
  button("取消", dialog).click(); await settle()
  check(!document.querySelector("dialog") && deleteCalls === 0, "Cancel must keep the answer")

  deletion = new Promise<void>(resolve => { releaseDelete = resolve })
  button("删除回答").click(); await settle()
  dialog = document.querySelector<HTMLDialogElement>("dialog")!
  const confirm = button("删除", dialog)
  confirm.click(); confirm.click(); await settle()
  check(deleteCalls === 1, "Duplicate confirm must not send another deletion")
  check(button("删除中…", dialog).disabled && button("取消", dialog).disabled, "Pending decisions must be disabled")
  const cancel = new Event("cancel", { cancelable: true })
  dialog.dispatchEvent(cancel)
  check(cancel.defaultPrevented, "Escape must not close a pending deletion")
  releaseDelete(); await settle()
  check(!document.querySelector("dialog"), "Acknowledged deletion must close confirmation")

  failDelete = true
  button("删除回答").click(); await settle()
  dialog = document.querySelector<HTMLDialogElement>("dialog")!
  button("删除", dialog).click(); await settle()
  check(dialog.open && dialog.textContent?.includes("fixture deletion unavailable"), "Failed deletion must retain the card and its reason")
  button("取消", dialog).click(); await settle()

  failCopy = true
  draw("copy-failure"); await settle()
  button("复制回答").click(); await settle()
  check(document.body.textContent?.includes("复制失败") && !document.querySelector('[aria-label="已复制"]'), "Copy failure must not claim success")
  draw("busy", true); await settle()
  check(button("删除回答").disabled, "Running conversation must disable deletion")

  failCopy = false; failDelete = false
  let groupVisible = true, copyReads = 0
  const phases: MessageData[] = [
    { id: "group-1", role: "assistant", runID: "run", content: "第一段", timestamp: "12:00", segments: [
      { id: "thinking", type: "thinking", content: "查询表情库" },
      { id: "tool", type: "tool", tool: { id: "call", name: "list_character_stickers", input: "{}", status: "success" } },
      { id: "text", type: "text", content: "第一段" }] },
    { id: "group-2", role: "assistant", runID: "run", content: "第二段", timestamp: "12:00" },
    { id: "group-3", role: "assistant", runID: "run", content: "", timestamp: "12:00", segments: [{ id: "sticker", type: "sticker",
      url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%23aacccc'/%3E%3C/svg%3E", name: "测试表情" }] },
  ]
  const groups = buildReplyActionGroups(phases)
  const drawGroup = () => flushSync(() => root.render(<StrictMode><div className="mx-auto mt-10 w-[min(44rem,calc(100vw-2rem))] text-text">
    <p>保留的用户消息</p><div data-fixture-reply>{groupVisible && phases.map((message, index) => <MessageBubble key={message.id}
      message={message} groupPosition={messageGroupPosition(phases, index)} replyGroup={groups.get(message.id)}
      onReadReplyText={async () => { copyReads++; return "未加载的开头\n\n第一段\n\n第二段" }}
      onDeleteMessage={async () => { await remove(); groupVisible = false; drawGroup() }} />)}</div><p>保留的其他回答</p>
  </div></StrictMode>))
  drawGroup(); await settle()
  check(host.querySelectorAll('[aria-label="复制回答"]').length === 1 && host.querySelectorAll('[aria-label="删除回答"]').length === 1,
    "All three phases must have exactly one shared footer")
  const previousWrites = writes.length
  button("复制回答", host).click(); button("复制回答", host).click(); await settle()
  check(copyReads === 1 && writes.length === previousWrites + 1 && writes.at(-1) === "未加载的开头\n\n第一段\n\n第二段",
    "Copy must read the complete reply including unloaded prefix exactly once")
  button("删除回答", host).click(); await settle()
  dialog = document.querySelector<HTMLDialogElement>("dialog")!
  check(dialog.textContent?.includes("全部内容") && dialog.textContent?.includes("3 条消息"), "Confirmation must describe the whole group")
  button("删除", dialog).click(); await settle()
  check(!host.querySelector('[data-fixture-reply]')?.textContent?.trim() && host.textContent?.includes("保留的用户消息")
    && host.textContent?.includes("保留的其他回答"), "Group deletion must retain user input and other replies")
  groupVisible = true; drawGroup(); await settle()
  button("删除回答").click(); await settle()
  return { writes: writes.length, deleteCalls, focusedConfirmation: true, cancelledWithoutDelete: true,
    duplicatePrevented: true, pendingEscapeBlocked: true, failureRetained: true, copyFailureShown: true, busyDisabled: true,
    groupedControls: true, fullReplyCopied: true, groupDeleted: true, copyReads }
}

Object.assign(window, { runMessageFooterTests })
