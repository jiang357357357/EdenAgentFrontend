const assert = require("node:assert/strict")
const test = require("node:test")

const { createDesktopCommandRouter, registerDesktopIpc } = require("../src/ipc/command-router.cjs")

test("desktop command router forwards event, sender and arguments", async () => {
  const sender = { id: 7 }
  const event = { sender }
  const router = createDesktopCommandRouter({
    ping: ({ event: receivedEvent, sender: receivedSender, args }) => {
      assert.equal(receivedEvent, event)
      assert.equal(receivedSender, sender)
      return args.value
    },
  })
  assert.equal(await router(event, "ping", { value: "pong" }), "pong")
})

test("desktop command router rejects unknown commands", async () => {
  const router = createDesktopCommandRouter({})
  await assert.rejects(router({ sender: {} }, "missing"), /未知桌面命令: missing/)
})

test("registerDesktopIpc installs the router on the desktop channel", () => {
  const registrations = []
  const router = registerDesktopIpc({
    ipcMain: { handle: (...args) => registrations.push(args) },
    handlers: { ping: () => true },
  })
  assert.equal(registrations[0][0], "eden-agent:invoke")
  assert.equal(registrations[0][1], router)
})
