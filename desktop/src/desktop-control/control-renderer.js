const bridge = window.edenDesktopControl
const title = document.getElementById('title'), detail = document.getElementById('detail')
const toggle = document.getElementById('toggle'), stop = document.getElementById('stop'), pin = document.getElementById('pin')
let state = {}, sending = false
function render() {
  const paused = state.paused || state.stopped
  title.textContent = state.connectionLost ? '桌面状态待确认' : !state.connected ? '正在连接桌面服务' : state.stopped ? '桌面控制已停止'
    : state.paused ? '桌面控制已暂停' : state.busy ? '智能体正在操作桌面' : '桌面控制就绪'
  detail.textContent = state.error || (paused ? `${state.control?.message || '暂停／停止来源未记录'}；恢复后重新观察`
    : state.operation ? `${state.operation.world} · ${state.operation.windowTitle || '查找或切换应用窗口'}`
    : '等待桌面任务；可拖动顶部移动窗口')
  detail.title = detail.textContent
  toggle.textContent = paused ? '恢复' : '暂停'
  toggle.disabled = sending || state.pending || !state.connected || (!state.busy && !paused)
  stop.disabled = sending || state.pending || !state.connected || state.stopped
  pin.setAttribute('aria-pressed', String(state.topmost !== false))
  pin.setAttribute('aria-label', state.topmost === false ? '置顶窗口' : '取消置顶')
  pin.title = pin.getAttribute('aria-label')
}
async function command(action) {
  if (sending) return
  sending = true; render()
  try { await bridge.command(action) }
  catch (error) { state.error = error instanceof Error ? error.message : '控制失败，请重试'; render() }
  finally { sending = false; render() }
}
toggle.addEventListener('click', () => void command(state.paused || state.stopped ? 'resume' : 'pause'))
stop.addEventListener('click', () => void command('stop'))
pin.addEventListener('click', () => void command('pin'))
document.getElementById('close').addEventListener('click', () => void command('close'))
bridge.onState(value => { state = value; render() })
render()
