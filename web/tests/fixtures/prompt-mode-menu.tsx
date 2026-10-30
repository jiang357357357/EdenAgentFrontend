import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ChatInputMenus } from '../../src/components/chat/input/ChatInputMenus'
import { PromptModeSettings } from '../../src/pages/settings/PromptModeSettings'
import { saveRuntimeOrigin } from '../../src/lib/runtime-origin'
import type { PermissionMode } from '../../src/types'

function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
async function until(condition: () => boolean) {
  const deadline = Date.now() + 5000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Prompt mode UI did not settle: ${document.body.textContent}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

async function runPromptModeMenuTests() {
  const calls: { origin: string; method: string; params: Record<string, unknown> }[] = []
  const configs = new Map<string, { enabled: boolean; updatedAt: number }>()
  let account = 'a', clock = 100, failNext = false
  let readGate: ReturnType<typeof deferred> | undefined, writeGate: ReturnType<typeof deferred> | undefined
  const current = (origin: string, who = account) => configs.get(`${origin}:${who}`) ?? { enabled: false, updatedAt: 0 }
  Object.assign(window, { promptModeFixtureRequest: async (origin: string, method: string, params: Record<string, unknown>) => {
    calls.push({ origin, method, params })
    if (method === 'command.terminal.get') return { platform: 'win32', hostShell: 'powershell.exe', hostAvailable: true,
      wslDistributions: ['Ubuntu'], deviceDefault: { kind: 'wsl', distribution: 'Ubuntu' }, sessionOverride: null,
      effective: { kind: 'wsl', distribution: 'Ubuntu' } }
    const who = account, value = { ...current(origin, who) }
    if (method === 'prompt.mode.get') { await readGate?.promise; return value }
    check(method === 'prompt.mode.update', `Unexpected RPC: ${method}`)
    check(JSON.stringify(Object.keys(params).sort()) === '["enabled","expectedUpdatedAt"]', 'Menu may only update the switch')
    await writeGate?.promise
    if (failNext) { failNext = false; throw new Error('保存失败，请重试') }
    if (params.expectedUpdatedAt !== current(origin, who).updatedAt) throw new Error('超限模式配置已变化，请重新读取后保存')
    const saved = { enabled: Boolean(params.enabled), updatedAt: ++clock }
    configs.set(`${origin}:${who}`, saved)
    return saved
  } })
  saveRuntimeOrigin('local')
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  function Fixture() {
    const [open, setOpen] = useState(true), [permission, setPermission] = useState<PermissionMode>('takeover')
    return <><button id="fixture-menu" onClick={() => setOpen(value => !value)}>开关权限菜单</button>
      <ChatInputMenus sessionId="fixture-session" hideComposerFooter={false} modelConfig={null} modelError={null}
        modelLoading={false} modelMenuOpen={false} modelSubmitting={null} onSelectModel={() => {}}
        onSelectPermission={setPermission} overlay={false} permissionMenuOpen={open} permissionMode={permission} permissionSubmitting={null} />
      <div id="fixture-settings"><PromptModeSettings /></div></>
  }
  flushSync(() => root.render(<Fixture />))
  const menuToggle = () => host.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"][aria-label="超限模式"]')!
  const settingsToggle = () => host.querySelector<HTMLButtonElement>('#fixture-settings [role="switch"]')!
  const isOn = (element: Element | null) => element?.getAttribute('aria-checked') === 'true'
  const writes = () => calls.filter(call => call.method === 'prompt.mode.update')
  const retry = () => [...host.querySelectorAll('button')].find(button => button.textContent === '重新读取超限模式')!
  const result: string[] = []
  try {
    await until(() => Boolean(menuToggle() && !menuToggle().disabled && !settingsToggle().disabled))
    check(!isOn(menuToggle()) && !isOn(settingsToggle()), 'Both entries must start with the saved state')
    check(host.querySelectorAll('[role="menuitemradio"]').length === 3, 'Keep the original three permission choices')
    check(host.querySelector('[aria-label="终端环境"]'), 'Keep terminal settings')
    check(host.querySelectorAll('textarea').length === 0, 'No manual template editor')
    result.push('menu-entry-and-existing-controls')

    writeGate = deferred(); menuToggle().click()
    await until(() => writes().length === 1 && menuToggle().disabled)
    check(!isOn(menuToggle()), 'Do not show enabled before the server confirms')
    menuToggle().click(); check(writes().length === 1, 'Do not submit a duplicate pending toggle')
    writeGate.resolve(); writeGate = undefined
    await until(() => isOn(menuToggle()) && isOn(settingsToggle()) && !menuToggle().disabled)
    check(current('local').enabled, 'Persist the menu toggle')
    result.push('confirmed-save-no-optimism', 'pending-toggle-deduplicated', 'menu-to-settings-sync')

    settingsToggle().click()
    check(isOn(menuToggle()), 'Unsaved settings edits must not affect the menu')
    const save = [...host.querySelectorAll<HTMLButtonElement>('#fixture-settings button')].find(button => button.textContent === '保存并应用')!
    await until(() => !save.disabled)
    save.click()
    await until(() => !isOn(menuToggle()) && !isOn(settingsToggle()) && !menuToggle().disabled)
    result.push('settings-to-menu-sync')
    host.querySelector<HTMLButtonElement>('[role="menuitemradio"]')!.click()
    await until(() => host.querySelector('[role="menuitemradio"][aria-checked="true"]')?.textContent?.includes('受限审批') === true)
    check(!current('local').enabled, 'Permission selection must not enable prompt mode')
    result.push('permission-mode-independent')

    failNext = true; menuToggle().click()
    await until(() => host.textContent?.includes('保存失败') === true && !menuToggle().disabled)
    check(!isOn(menuToggle()) && !current('local').enabled, 'Failure must retain the confirmed state')
    retry().click(); await until(() => !menuToggle().disabled && !host.textContent?.includes('保存失败'))
    menuToggle().click(); await until(() => isOn(menuToggle()) && !menuToggle().disabled)
    result.push('save-failure-and-retry')

    configs.set('local:a', { enabled: false, updatedAt: ++clock })
    menuToggle().click(); await until(() => host.textContent?.includes('配置已变化') === true && !menuToggle().disabled)
    check(!current('local').enabled, 'A stale save must not overwrite newer config')
    retry().click(); await until(() => !isOn(menuToggle()) && !menuToggle().disabled)
    result.push('stale-save-conflict')
    host.querySelector<HTMLButtonElement>('#fixture-menu')!.click()
    await until(() => !menuToggle())
    host.querySelector<HTMLButtonElement>('#fixture-menu')!.click()
    await until(() => Boolean(menuToggle() && !menuToggle().disabled))
    check(!isOn(menuToggle()), 'Reopening the menu must read persisted config')
    result.push('reopen-persistence')

    readGate = deferred(); const delayedRead = readGate
    saveRuntimeOrigin('mon'); await until(() => calls.filter(call => call.origin === 'mon' && call.method === 'prompt.mode.get').length >= 2)
    saveRuntimeOrigin('local'); readGate = undefined
    await until(() => !menuToggle().disabled)
    delayedRead.resolve(); await new Promise(resolve => setTimeout(resolve, 50))
    check(!isOn(menuToggle()), 'Old world reads must not overwrite the active world')
    result.push('delayed-world-read-isolated')

    writeGate = deferred(); const delayedWrite = writeGate, before = writes().length
    menuToggle().click(); await until(() => writes().length === before + 1)
    saveRuntimeOrigin('mon'); await until(() => !menuToggle().disabled)
    delayedWrite.resolve(); writeGate = undefined
    await until(() => current('local').enabled)
    await new Promise(resolve => setTimeout(resolve, 50))
    check(!isOn(menuToggle()) && !isOn(settingsToggle()), 'Old world write confirmation must not enter the new world')
    saveRuntimeOrigin('local'); await until(() => isOn(menuToggle()) && !menuToggle().disabled)
    result.push('delayed-world-write-isolated')

    account = 'b'; window.dispatchEvent(new Event('edenagent:account-changed'))
    await until(() => !isOn(menuToggle()) && !menuToggle().disabled)
    check(!current('local', 'b').enabled && current('local', 'a').enabled, 'Accounts must not inherit mode')
    menuToggle().click(); await until(() => isOn(menuToggle()) && !menuToggle().disabled)
    check(current('local', 'b').enabled, 'Save within the new account')
    result.push('account-isolation')
    return { checks: result, writes: writes().length }
  } finally { root.unmount(); host.remove() }
}
Object.assign(window, { runPromptModeMenuTests })
