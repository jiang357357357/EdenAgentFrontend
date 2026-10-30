import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { TokenMeter } from '../../src/components/chat/input/ChatInputControls'
import { fixture } from './context-limit-host'

declare global { interface Window {
  prepareContextLimit(): Promise<void>
  runContextLimitTests(): Promise<Record<string, boolean>>
  prepareMobileContextLimit(): Promise<void>
} }
const host = document.createElement('div')
host.style.cssText = 'position:absolute;right:48px;bottom:48px'
document.body.append(host)
const root = createRoot(host)
let instance = 0
const wait = () => new Promise<void>(resolve => setTimeout(resolve, 25))
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
async function until(condition: () => boolean) {
  const end = performance.now() + 3000
  while (!condition() && performance.now() < end) await wait()
  assert(condition(), `Timed out waiting for ${String(condition)}; ${dialog()?.textContent?.slice(0, 1200) ?? 'no dialog'}`)
}
const dialog = () => document.querySelector<HTMLDialogElement>('dialog[open]')
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(node => node.textContent === text)!
const field = () => document.querySelector<HTMLInputElement>('dialog input[type="number"]')!
const meter = () => host.querySelector<HTMLButtonElement>('button[title="调整上下文上限"]')!
function render(sessionId = 'first', isRunning = false) {
  flushSync(() => root.render(<TokenMeter key={`${sessionId}:${instance}`} sessionId={sessionId} isRunning={isRunning}
    contextTokens={45000} inputTokens={100} contextWindow={262144} draft="当前未发送文字" />))
}
async function open() {
  meter().click()
  await until(() => Boolean(field()) && !field().disabled)
}
function setValue(value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field(), value)
  field().dispatchEvent(new Event('input', { bubbles: true }))
}
function submit() { document.querySelector<HTMLFormElement>('dialog form')!.requestSubmit() }
async function close() {
  dialog()!.querySelector<HTMLButtonElement>('header button')!.click()
  await until(() => !document.querySelector('dialog'))
}
window.prepareContextLimit = async () => {
  render(); await wait(); await open()
  assert(field().value === '262144', 'single click opens the limit dialog with the server value')
  const rect = dialog()!.getBoundingClientRect()
  assert(rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, 'dialog fits desktop viewport')
}
window.runContextLimitTests = async () => {
  const result: Record<string, boolean> = { singleClickAndDesktopLayout: true }
  button('64K').click(); await wait()
  assert(field().value === '65536', 'preset fills the numeric field')
  submit(); await until(() => !dialog())
  assert(meter().textContent === '69%', 'saved budget updates the meter immediately')
  result.presetSaveAndMeter = true
  instance++; render(); await until(() => meter().textContent === '69%')
  await open(); assert(field().value === '65536', 'remount reads the saved budget')
  result.persistedReload = true
  setValue('1000'); await wait()
  assert(button('保存').disabled, 'below-minimum input cannot be saved')
  setValue('262145'); await wait()
  assert(button('保存').disabled, 'above-provider input cannot be saved')
  setValue('65536.5'); await wait()
  assert(button('保存').disabled, 'fractional token counts cannot be saved')
  setValue('98304'); await wait()
  fixture.failSave = true; submit()
  await until(() => Boolean(dialog()?.querySelector('[role="alert"]')))
  assert(Boolean(dialog()) && meter().textContent === '69%', 'failed save retains dialog and active budget')
  fixture.failSave = false; submit(); await until(() => !dialog())
  assert(meter().textContent === '46%', 'custom budget is reflected after retry')
  result.validationAndFailureRecovery = true
  await open(); button('查看上下文内容').click()
  await until(() => dialog()?.querySelector('h2')?.textContent === '当前上下文')
  await until(() => Boolean(dialog()?.textContent?.includes('保留实际上下文查看能力')))
  dialog()!.querySelector<HTMLButtonElement>('header button')!.click()
  await until(() => Boolean(field()))
  button('恢复默认').click(); await until(() => !dialog())
  assert(meter().textContent === '17%', 'reset restores default budget and percentage')
  result.contentViewerAndReset = true
  await open(); button('64K').click(); await wait(); submit(); await until(() => !dialog())
  render('second'); await until(() => meter().textContent === '17%')
  await open(); assert(field().value === '262144', 'another session does not inherit the previous budget')
  await close()
  result.sessionIsolation = true
  render('second', true); await wait(); meter().click()
  await until(() => Boolean(field()) && dialog()!.textContent!.includes('当前正在回答'))
  assert(field().disabled && button('保存').disabled, 'running session only permits viewing')
  render('second', false); await until(() => Boolean(field()) && !field().disabled)
  await close()
  fixture.failRead = true; meter().click()
  await until(() => Boolean(dialog()?.querySelector('[role="alert"]')))
  assert(button('保存').disabled, 'read failures do not offer a default-value overwrite')
  fixture.failRead = false; button('重新读取').click()
  await until(() => Boolean(field()) && !field().disabled)
  await close()
  result.busyAndReadRecovery = true
  return result
}
window.prepareMobileContextLimit = async () => {
  await open()
  const rect = dialog()!.getBoundingClientRect()
  assert(rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, 'dialog fits mobile viewport')
  assert(dialog()!.scrollWidth <= dialog()!.clientWidth, 'no horizontal overflow')
}
