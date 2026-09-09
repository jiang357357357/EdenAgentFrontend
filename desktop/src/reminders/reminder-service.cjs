const { createRealmRpc } = require('../processes/realm-rpc.cjs')
const { createReminderWindow } = require('./reminder-window.cjs')

function createDesktopReminderService({ BrowserWindow, screen, ipcMain, capability, logger = console }) {
  const rpc = createRealmRpc({ capability })
  const windows = new Map()
  let timer, running = false, closed = false
  async function poll() {
    if (closed || running) return
    running = true
    try {
      for (const origin of ['mon', 'local']) {
        if (closed) break
        try {
          const reminders = await rpc(origin, 'desktop.reminder.list', { limit: 20, includeClosed: false })
          if (closed) break
          if (!Array.isArray(reminders)) throw new Error('Invalid reminder list')
          const current = windows.get(origin)
          if (current) {
            if (!reminders.some(item => item.id === current.id)) current.window.destroy()
            continue
          }
          const reminder = reminders[0]
          if (!reminder || typeof reminder.id !== 'string' || typeof reminder.title !== 'string' || typeof reminder.message !== 'string') continue
          const window = createReminderWindow({ BrowserWindow, screen, ipcMain, origin, reminder,
            acknowledge: () => rpc(origin, 'desktop.reminder.close', { id: reminder.id }),
            displayed: () => rpc(origin, 'desktop.reminder.displayed', { id: reminder.id }),
            onClosed: () => windows.delete(origin),
          })
          windows.set(origin, { id: reminder.id, window })
        } catch (error) {
          // Starting or externally managed realms may be unavailable. Keep durable reminders for the next poll.
          if (!closed && windows.has(origin)) logger.warn(`Reminder service ${origin}: ${error.message}`)
        }
      }
    } finally { running = false; if (!closed) { timer = setTimeout(() => { void poll() }, 5000); timer.unref?.() } }
  }
  return {
    start() { if (!closed && !running && !timer) void poll() },
    close() { closed = true; clearTimeout(timer); for (const { window } of windows.values()) if (!window.isDestroyed()) window.destroy(); windows.clear() },
  }
}
module.exports = { createDesktopReminderService }
