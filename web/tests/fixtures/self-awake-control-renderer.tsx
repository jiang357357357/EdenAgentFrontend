import { createRoot } from 'react-dom/client'
import { SelfAwakeControl } from '../../src/pages/self-awake/SelfAwakeControl'

declare global {
  interface Window {
    wakeFixture: { revision: number; control: any; calls: any[]; failUpdate: boolean }
    runWakeControlTests(): Promise<Record<string, boolean>>
  }
}

const host = document.createElement('div')
host.style.cssText = 'width:1100px;padding:50px'
document.body.append(host)
const root = createRoot(host)
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const until = async (condition: () => boolean) => {
  const deadline = performance.now() + 5000
  while (!condition() && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
  assert(condition(), `UI condition timed out: ${host.textContent}`)
}
const button = () => host.querySelector<HTMLButtonElement>('[role=switch]')!
window.wakeFixture = { revision: 0, calls: [], failUpdate: false, control: {
  enabled: true, updatedAt: 7, publicationError: null,
  schedule: { status: 'retrying', nextWakeAt: new Date(Date.now() + 3600000).toISOString(),
    reason: '上次唤醒失败，累计连续失败 5 次；Agent 通信失败 (kind=connect, system_code=10061)' },
} }
root.render(<SelfAwakeControl refreshVersion={0} />)

window.runWakeControlTests = async () => {
  await until(() => host.textContent?.includes('上次失败') === true)
  assert(button().getAttribute('aria-checked') === 'true', 'retry must not turn off the switch')
  assert(host.querySelector('[role=alert]')?.textContent?.includes('system_code=10061'), 'actual failure must remain visible')
  assert(!host.textContent?.includes('已提交计划，等待派发'), 'retry must not claim normal dispatch')
  const retryVisible = true
  button().click()
  await until(() => host.textContent?.includes('自醒已暂停') === true)
  const update = window.wakeFixture.calls.find(call => call.method === 'self_awake.control.update')
  assert(update.input.enabled === false && update.input.expectedUpdatedAt === 7, 'toggle must bind the observed revision')
  assert(!host.querySelector('[role=alert]'), 'paused state must clear the old failure')
  const pauseConfirmed = true
  window.wakeFixture.failUpdate = true
  button().click()
  await until(() => host.querySelector('[role=alert]')?.textContent?.includes('结果未确认') === true)
  assert(button().disabled, 'unknown update must require reconciliation before another toggle')
  assert(button().getAttribute('aria-checked') === 'false', 'failed save must preserve the confirmed switch')
  const mutationUncertaintyVisible = true
  window.wakeFixture.control = { enabled: true, updatedAt: 22, publicationError: null,
    schedule: { status: 'running', nextWakeAt: null, reason: 'another account executing' } }
  window.wakeFixture.revision++
  window.dispatchEvent(new Event('edenagent:account-changed'))
  await until(() => host.textContent?.includes('自醒进行中') === true)
  assert(!host.querySelector('[role=alert]'), 'account switch must discard the previous error')
  assert(button().getAttribute('aria-checked') === 'true', 'account switch must load its own control')
  root.unmount()
  return { retryVisible, pauseConfirmed, mutationUncertaintyVisible, accountScopeReloaded: true }
}
