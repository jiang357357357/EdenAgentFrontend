import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { MessageFooter } from "../../src/components/chat/message/MessageFooter"

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

  draw("preview"); await settle()
  button("删除回答").click(); await settle()
  return { writes: writes.length, deleteCalls, focusedConfirmation: true, cancelledWithoutDelete: true,
    duplicatePrevented: true, pendingEscapeBlocked: true, failureRetained: true, copyFailureShown: true, busyDisabled: true }
}

Object.assign(window, { runMessageFooterTests })
