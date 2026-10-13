import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { CommandExecutionSettings } from '../../src/components/chat/input/CommandExecutionSettings'

function check(value: unknown, message: string) { if (!value) throw new Error(message) }
async function until(condition: () => boolean) {
  const deadline = Date.now() + 5000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`UI did not settle: ${document.body.textContent}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
async function runTerminalSettingsTests() {
  const calls: { method: string; params: unknown }[] = []
  let detected = false, target = { kind: 'wsl', distribution: 'Ubuntu' } as { kind: string; distribution?: string }
  const info = () => ({ platform: 'win32', hostShell: 'powershell.exe', hostAvailable: true,
    wslDistributions: detected ? ['Ubuntu'] : [], ...(detected ? {} : { wslDetectionError: 'WSL 发行版检测超时（5 秒）；无法确认当前状态，不代表发行版未安装。' }),
    deviceDefault: target, sessionOverride: null, effective: target })
  Object.assign(window, { terminalFixtureRequest: async (_origin: string, method: string, params: { target?: typeof target }) => {
    calls.push({ method, params })
    if (method === 'command.terminal.set') target = params.target!
    else check(method === 'command.terminal.get', 'Unexpected RPC')
    return info()
  } })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(<CommandExecutionSettings />))
  await until(() => Boolean(host.querySelector('select')))
  check(host.querySelector('select')!.value === 'wsl:Ubuntu', 'Detection failure must retain the selected distro')
  check(host.textContent?.includes('检测超时'), 'The detection cause must be visible')
  check(!host.textContent?.includes('未检测到已安装') && !host.textContent?.includes('请重新选择'), 'Unknown detection must not claim uninstalled or unavailable')
  const select = host.querySelector('select')!
  check(!select.disabled, 'Host selection must remain usable during detection failure')
  select.value = 'host'; select.dispatchEvent(new Event('change', { bubbles: true }))
  await until(() => host.textContent?.includes('当前命令：本机 PowerShell') === true && calls.filter(call => call.method === 'command.terminal.get').length >= 2)
  check(calls.filter(call => call.method === 'command.terminal.set').length === 1, 'Host change must be saved once')
  check(host.textContent?.includes('检测超时') && !host.textContent?.includes('未检测到已安装'), 'Saved host selection must not erase the diagnosis')
  detected = true
  const retry = [...host.querySelectorAll('button')].find(button => button.textContent === '重新检测 WSL')
  check(retry, 'Detection error must offer retry'); retry!.click()
  await until(() => !host.textContent?.includes('检测超时'))
  check([...select.options].some(option => option.value === 'wsl:Ubuntu'), 'Recovery must restore real distro choices')
  select.value = 'wsl:Ubuntu'; select.dispatchEvent(new Event('change', { bubbles: true }))
  await until(() => host.textContent?.includes('当前命令：WSL · Ubuntu') === true && !select.disabled)
  check(calls.filter(call => call.method === 'command.terminal.set').length === 2, 'Recovery must allow WSL selection')
  root.unmount()
  return { unknownRetainsChoice: true, causeShown: true, noFalseMissing: true, hostUsable: true, retryRecovers: true, setCalls: 2 }
}
Object.assign(window, { runTerminalSettingsTests })
