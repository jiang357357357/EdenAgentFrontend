const { createRealmRpc } = require('../processes/realm-rpc.cjs')
const { createDesktopControlWindow } = require('./control-window.cjs')
const { desktopStatus, controlView } = require('./control-status.cjs')

function createDesktopControlService({ BrowserWindow, screen, ipcMain, capability, coreToken = () => null,
  placementFile, rpcRequest, createWindow = createDesktopControlWindow, intervalMs = 1000, logger = console }) {
  const rpc = rpcRequest || createRealmRpc({ capability, coreToken })
  const states = new Map(['mon', 'local'].map(origin => [origin, { status: null, connected: false }]))
  const requests = new Map(), timers = new Map(), refreshing = new Set()
  let view, started = false, closed = false, manual = false
  let revision = 0, pending = false, error = ''
  function state() { return controlView(states, { pending, error }) }
  function ensureWindow() {
    if (!view && !closed) view = createWindow({ BrowserWindow, screen, ipcMain, placementFile, control, dismiss,
      logger, onClosed: () => { view = undefined } })
    return view
  }
  function publish() {
    if (closed) return
    const value = state()
    // Only an explicit tray action opens this window. Tool calls and polling only update state.
    if (manual) { const target = ensureWindow(); target?.update(value); target?.show() }
    else { view?.update(value); view?.hide() }
  }
  async function request(origin, method, params = {}) {
    const controller = new AbortController(); requests.set(controller, origin)
    try { return await rpc(origin, method, params, { signal: controller.signal }) }
    finally { requests.delete(controller) }
  }
  function schedule(origin) {
    for (const world of origin ? [origin] : states.keys()) {
      clearTimeout(timers.get(world))
      if (started && !closed) {
        const timer = setTimeout(() => { void refresh(world) }, intervalMs)
        timer.unref?.(); timers.set(world, timer)
      }
    }
  }
  async function refresh(origin) {
    if (closed || refreshing.has(origin)) return
    refreshing.add(origin)
    const captured = revision
    try {
      if (origin === 'mon' && !coreToken()) states.set(origin, { status: null, connected: false })
      else {
        const status = desktopStatus(await request(origin, 'desktop.status'))
        if (!closed && captured === revision) states.set(origin, { status, connected: true })
      }
    } catch {
      if (!closed && captured === revision) states.set(origin, { ...states.get(origin), connected: false })
    } finally {
      if (!closed && captured === revision) publish()
      refreshing.delete(origin); schedule(origin)
    }
  }
  async function control(action) {
    if (closed || pending) throw new Error('桌面控制正在处理，请稍后重试')
    if (!['pause', 'resume', 'stop'].includes(action)) throw new Error('未知桌面控制动作')
    const live = [...states.entries()].filter(([, s]) => s.connected && s.status?.available)
    const origin = live.find(([, s]) => s.status.operations.some(o => o.state === 'running'))?.[0] || live[0]?.[0]
    if (!origin) { error = '桌面服务尚未连接，请稍后重试'; publish(); throw new Error(error) }
    const captured = ++revision
    pending = true; error = ''; publish()
    try {
      const status = desktopStatus(await request(origin, 'desktop.control', { action }))
      if (closed || captured !== revision) throw new Error('账号或控制状态已变化，请重新确认')
      states.set(origin, { status, connected: true })
      for (const [other, s] of states) if (other !== origin && s.status) states.set(other, { ...s,
        status: { ...s.status, paused: status.paused, stopped: status.stopped, ...(status.control ? { control: status.control } : {}) } })
    } catch (reason) {
      if (!closed && captured === revision) error = reason instanceof Error ? reason.message : '桌面控制结果待确认，请先检查当前状态'
      throw reason
    } finally { pending = false; publish(); schedule() }
  }
  async function dismiss() {
    if (state().busy && !state().stopped) await control('stop')
    manual = false; error = ''; view?.hide()
  }
  return {
    owns(contents) { return view?.window?.webContents === contents },
    start() { if (closed || started) return; started = true; for (const origin of states.keys()) void refresh(origin) },
    show() { manual = true; publish(); for (const origin of states.keys()) void refresh(origin) },
    authenticationChanged() {
      revision++; states.set('mon', { status: null, connected: false }); rpc.invalidate?.('mon')
      for (const [controller, origin] of requests) if (origin === 'mon') controller.abort()
      error = ''; publish(); if (started) for (const origin of states.keys()) void refresh(origin)
    },
    close() {
      closed = true; revision++; for (const timer of timers.values()) clearTimeout(timer)
      for (const controller of requests.keys()) controller.abort()
      rpc.close?.(); view?.close(); view = undefined
    },
  }
}
module.exports = { createDesktopControlService }
