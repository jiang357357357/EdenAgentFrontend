const assert = require("node:assert/strict")
const test = require("node:test")

const { createWindowCommandHandlers } = require("../src/ipc/window-command-handlers.cjs")

test("window commands minimize, maximize and close the sender window", () => {
  const calls = []
  const targetWindow = {
    maximized: false,
    close: () => calls.push("close"),
    minimize: () => calls.push("minimize"),
    isMaximized() { return this.maximized },
    maximize() { this.maximized = true; calls.push("maximize") },
    unmaximize() { this.maximized = false; calls.push("unmaximize") },
  }
  const handlers = createWindowCommandHandlers({
    BrowserWindow: { fromWebContents: () => targetWindow },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getMainWindow: () => null,
  })
  const context = { sender: {} }

  assert.equal(handlers.close_current_window(context), true)
  assert.equal(handlers.minimize_current_window(context), true)
  assert.equal(handlers.toggle_maximize_current_window(context), true)
  assert.equal(handlers.toggle_maximize_current_window(context), true)
  assert.deepEqual(calls, ["close", "minimize", "maximize", "unmaximize"])
})

test("directory selection returns the selected directory", async () => {
  const mainWindow = {}
  const handlers = createWindowCommandHandlers({
    BrowserWindow: { fromWebContents: () => null },
    dialog: {
      showOpenDialog: async (owner, options) => {
        assert.equal(owner, mainWindow)
        assert.deepEqual(options.properties, ["openDirectory"])
        return { canceled: false, filePaths: ["D:\\skills"] }
      },
    },
    getMainWindow: () => mainWindow,
  })
  assert.equal(await handlers.select_skill_directory({ sender: {} }), "D:\\skills")
})
