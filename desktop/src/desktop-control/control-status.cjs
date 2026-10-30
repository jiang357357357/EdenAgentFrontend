function controlEvent(value) {
  if (value === undefined) return undefined
  if (!value || !['pause', 'resume', 'stop'].includes(value.action)
    || !['manual', 'physical_input', 'shortcut', 'observer_unavailable', 'watchdog', 'legacy', 'state_corrupt'].includes(value.source)
    || !Number.isSafeInteger(value.changedAt) || value.changedAt < 0 || (value.message !== undefined && typeof value.message !== 'string'))
    throw new Error('桌面控制原因格式无效')
  return { action: value.action, source: value.source, changedAt: value.changedAt,
    ...(value.message ? { message: value.message.slice(0, 500) } : {}) }
}
function desktopStatus(value) {
  if (!value || typeof value !== 'object' || !['available', 'busy', 'paused', 'stopped', 'observerAvailable'].every(k => typeof value[k] === 'boolean')
    || !Array.isArray(value.operations) || value.operations.length > 32) throw new Error('桌面状态格式无效')
  const operations = value.operations.map(operation => {
    if (!operation || typeof operation.windowTitle !== 'string' || typeof operation.action !== 'string'
      || !['queued', 'running'].includes(operation.state)) throw new Error('桌面任务格式无效')
    return { windowTitle: operation.windowTitle.slice(0, 1000), action: operation.action, state: operation.state }
  })
  const control = controlEvent(value.control)
  return { available: value.available, busy: value.busy, paused: value.paused, stopped: value.stopped,
    observerAvailable: value.observerAvailable, operations, ...(control ? { control } : {}) }
}
function controlView(states, extra = {}) {
  const entries = [...states.entries()], live = entries.filter(([, state]) => state.connected)
  const operations = entries.flatMap(([origin, state]) => state.status?.operations.map(operation => ({ ...operation, origin,
    world: origin === 'mon' ? '伊甸园' : '尘世' })) || [])
  const statuses = entries.flatMap(([, state]) => state.status ? [state.status] : [])
  const control = statuses.flatMap(s => s.control ? [s.control] : []).sort((a, b) => b.changedAt - a.changedAt)[0]
  return { available: statuses.some(s => s.available), connected: live.length > 0,
    busy: statuses.some(s => s.busy), paused: control ? control.action === 'pause' : statuses.some(s => s.paused),
    stopped: control ? control.action === 'stop' : statuses.some(s => s.stopped), ...(control ? { control } : {}),
    operation: operations.find(o => o.state === 'running') || operations[0] || null,
    connectionLost: entries.some(([, state]) => !state.connected && state.status?.busy), ...extra }
}
module.exports = { desktopStatus, controlView }
