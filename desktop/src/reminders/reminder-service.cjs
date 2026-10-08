const { createRealmRpc } = require('../processes/realm-rpc.cjs')
const { createReminderWindow } = require('./reminder-window.cjs')

function createDesktopReminderService({ BrowserWindow, screen, ipcMain, capability, coreToken = () => null,
  logger = console, rpcRequest, createWindow = createReminderWindow, retryIntervalMs = 5000 }) {
  const rpc = rpcRequest || createRealmRpc({ capability, coreToken })
  const windows = new Map(), requests = new Map(), failures = new Map()
  const states = new Map(['mon', 'local'].map(origin => [origin, { busy: false, again: false, timer: null }]))
  const subscriptions = []
  let closed = false, started = false, revision = 0
  const current = (origin, expected) => !closed && (origin === 'local' || expected === revision)
  async function request(origin, method, params, expectedRevision = revision) {
    if (!current(origin, expectedRevision)) throw new Error('Reminder account changed')
    const controller = new AbortController()
    requests.set(controller, origin)
    try { return await rpc(origin, method, params, { signal: controller.signal }) }
    finally { requests.delete(controller) }
  }
  function report(origin, error) {
    const message = error instanceof Error ? error.message : String(error)
    if (failures.get(origin) !== message) logger.warn(`Reminder service ${origin}: ${message}`)
    failures.set(origin, message)
  }
  function wake(origin, delay = 0) {
    if (!started || closed) return
    const state = states.get(origin)
    if (state.busy) { state.again = true; return }
    clearTimeout(state.timer)
    state.timer = setTimeout(() => { state.timer = null; void refresh(origin) }, delay)
    state.timer.unref?.()
  }
  function openWindow(origin, reminder, accountRevision) {
    if (!reminder || typeof reminder.id !== 'string' || typeof reminder.title !== 'string' || typeof reminder.message !== 'string') return
    let acknowledged = false
    const window = createWindow({ BrowserWindow, screen, ipcMain, origin, reminder,
      acknowledge: async () => {
        const result = await request(origin, 'desktop.reminder.close', { id: reminder.id }, accountRevision)
        acknowledged = true
        if (current(origin, accountRevision)) wake(origin)
        return result
      },
      displayed: () => request(origin, 'desktop.reminder.displayed', { id: reminder.id }, accountRevision)
        .catch(error => { if (current(origin, accountRevision)) report(origin, error); throw error }),
      onClosed: () => {
        if (windows.get(origin)?.window !== window) return
        windows.delete(origin)
        // Also retry a window that failed to load, without opening it in a tight loop.
        if (current(origin, accountRevision)) wake(origin, acknowledged ? 0 : retryIntervalMs)
      },
    })
    windows.set(origin, { id: reminder.id, window })
  }
  async function refresh(origin) {
    const state = states.get(origin)
    if (closed || state.busy || (origin === 'mon' && !coreToken())) return
    state.busy = true; state.again = false
    const accountRevision = revision
    let failed = false
    try {
      const reminders = await request(origin, 'desktop.reminder.list', { limit: 20, includeClosed: false }, accountRevision)
      if (!current(origin, accountRevision)) return
      if (!Array.isArray(reminders)) throw new Error('Invalid reminder list')
      failures.delete(origin)
      const existing = windows.get(origin)
      if (existing && reminders.some(item => item.id === existing.id)) return
      if (existing) { windows.delete(origin); if (!existing.window.isDestroyed()) existing.window.destroy() }
      openWindow(origin, reminders[0], accountRevision)
    } catch (error) {
      if (current(origin, accountRevision)) { failed = true; report(origin, error) }
    } finally {
      state.busy = false
      if (failed) wake(origin, retryIntervalMs)
      else if (state.again) wake(origin)
    }
  }
  return {
    start() {
      if (closed || started) return
      started = true
      for (const origin of states.keys()) {
        if (rpc.subscribe) subscriptions.push(rpc.subscribe(origin, event => wake(origin, event.type === 'disconnected' ? retryIntervalMs : 0)))
        wake(origin)
      }
    },
    authenticationChanged() {
      revision++; failures.delete('mon')
      for (const [controller, origin] of requests) if (origin === 'mon') controller.abort()
      rpc.invalidate?.('mon')
      const existing = windows.get('mon')
      windows.delete('mon')
      if (existing && !existing.window.isDestroyed()) existing.window.destroy()
      wake('mon')
    },
    close() {
      closed = true
      for (const unsubscribe of subscriptions) unsubscribe()
      for (const state of states.values()) clearTimeout(state.timer)
      for (const controller of requests.keys()) controller.abort()
      rpc.close?.()
      for (const { window } of windows.values()) if (!window.isDestroyed()) window.destroy()
      windows.clear()
    },
  }
}
module.exports = { createDesktopReminderService }
