const assert = require("node:assert/strict")
const test = require("node:test")
const { createClipboardCommandHandlers } = require("../src/ipc/clipboard-command-handlers.cjs")
const { createDesktopCommandRouter } = require("../src/ipc/command-router.cjs")
const { isInternalAppUrl } = require("../src/protocols/navigation-policy.cjs")

function fixture(url = "edenagent://app/index.html") {
  const writes = [], frame = { url }
  const sender = { mainFrame: frame, isDestroyed: () => false }
  const window = { webContents: sender, isDestroyed: () => false }
  const clipboard = { writeText: text => writes.push(text) }
  const handlers = createClipboardCommandHandlers({ clipboard, getWindows: () => [window, null],
    isInternalUrl: value => isInternalAppUrl(value, { isPackaged: true }) })
  return { writes, frame, sender, window, clipboard, route: createDesktopCommandRouter(handlers) }
}

test("trusted main-frame command copies full Unicode and multiline text without coercion", async () => {
  const host = fixture(), text = "**完整回答**\n中文、emoji 😊\n  代码\\路径\n" + "长正文".repeat(100_000)
  assert.equal(await host.route({ sender: host.sender, senderFrame: host.frame }, "write_clipboard_text", { text }), true)
  assert.deepEqual(host.writes, [text])
})

test("clipboard commands reject foreign windows, subframes, external pages and destroyed senders", async () => {
  const host = fixture(), event = { sender: host.sender, senderFrame: host.frame }
  const invoke = value => host.route(value, "write_clipboard_text", { text: "must not write" })
  await assert.rejects(invoke({ ...event, sender: { ...host.sender } }), /无权写入/)
  await assert.rejects(invoke({ ...event, senderFrame: { ...host.frame } }), /无权写入/)
  await assert.rejects(invoke({ sender: host.sender }), /无权写入/)
  host.frame.url = "https://outside.example/index.html"
  await assert.rejects(invoke(event), /无权写入/)
  host.frame.url = "edenagent://app/index.html"
  host.sender.isDestroyed = () => true
  await assert.rejects(invoke(event), /无权写入/)
  host.sender.isDestroyed = () => false
  host.window.isDestroyed = () => true
  await assert.rejects(invoke(event), /无权写入/)
  assert.deepEqual(host.writes, [])
})

test("invalid clipboard arguments do not write and native errors propagate instead of reporting success", async () => {
  const host = fixture(), event = { sender: host.sender, senderFrame: host.frame }
  for (const text of [null, 123, { toString: () => "not text" }, undefined]) {
    await assert.rejects(host.route(event, "write_clipboard_text", { text }), /必须是文本/)
  }
  assert.deepEqual(host.writes, [])
  host.clipboard.writeText = () => { throw new Error("clipboard unavailable") }
  await assert.rejects(host.route(event, "write_clipboard_text", { text: "正文" }), /clipboard unavailable/)
})

test("development clipboard command accepts only the configured frontend origin", async () => {
  const host = fixture("http://127.0.0.1:40091/?page=chat"), writes = []
  const route = createDesktopCommandRouter(createClipboardCommandHandlers({
    clipboard: { writeText: text => writes.push(text) }, getWindows: () => [host.window],
    isInternalUrl: value => isInternalAppUrl(value, { isPackaged: false, devOrigin: "http://127.0.0.1:40091" }),
  }))
  const event = { sender: host.sender, senderFrame: host.frame }
  assert.equal(await route(event, "write_clipboard_text", { text: "开发环境" }), true)
  host.frame.url = "http://127.0.0.1:40092/"
  await assert.rejects(route(event, "write_clipboard_text", { text: "wrong origin" }), /无权写入/)
  assert.deepEqual(writes, ["开发环境"])
})
