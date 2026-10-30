import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MemoryModelSettings } from '../../src/pages/settings/MemoryModelSettings'
import { saveRuntimeOrigin } from '../../src/lib/runtime-origin'
import type { MemoryModelStatus } from '@eden/api'

function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
async function until(condition: () => boolean) {
  const deadline = Date.now() + 5000
  while (!condition()) { if (Date.now() > deadline) throw new Error(document.body.textContent ?? 'UI timeout'); await new Promise(resolve => setTimeout(resolve, 20)) }
}

async function runModelTests() {
  const calls: string[] = []
  let status: MemoryModelStatus = { model: 'bge-small-zh-v1.5', state: 'missing', path: 'fixture', downloadedBytes: 0, totalBytes: 100, error: null }
  let delay: Promise<void> | undefined, release!: () => void
  Object.assign(window, { modelFixtureRequest: async (origin: string, method: string) => {
    check(origin === 'local', 'Must never download for Mon')
    calls.push(method)
    if (method === 'memory.model.download') status = { ...status, state: 'downloading', downloadedBytes: 25, error: null }
    if (method === 'memory.model.cancel') status = { ...status, state: 'cancelled', error: null }
    const captured = { ...status }
    await delay
    return captured
  } })
  saveRuntimeOrigin('local')
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const button = (text: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.includes(text))!
  flushSync(() => root.render(<MemoryModelSettings />))
  try {
    await until(() => Boolean(button('下载模型') && !button('下载模型').disabled))
    check(Boolean(calls.every(method => method === 'memory.model.status')), 'Opening settings cannot download automatically')
    button('下载模型').click()
    await until(() => host.textContent?.includes('25%') === true && Boolean(button('取消下载')))
    button('取消下载').click()
    await until(() => Boolean(button('下载模型') && !button('下载模型').disabled))
    check(calls.filter(method => method === 'memory.model.cancel').length === 1, 'Cancel must call backend')
    status = { ...status, state: 'error', error: '模型文件校验失败' }
    button('刷新状态').click(); await until(() => host.textContent?.includes('校验失败') === true)
    button('重试下载').click(); await until(() => host.textContent?.includes('25%') === true)
    status = { ...status, state: 'ready', downloadedBytes: 100 }
    await until(() => host.textContent?.includes('模型已就绪') === true)
    check(button('已下载').disabled, 'Ready models cannot download twice')
    delay = new Promise(resolve => { release = resolve })
    button('刷新状态').click(); await new Promise(resolve => setTimeout(resolve, 40))
    saveRuntimeOrigin('mon'); await until(() => !host.textContent?.includes('本地记忆模型'))
    release(); await new Promise(resolve => setTimeout(resolve, 40))
    check(!host.textContent?.includes('本地记忆模型'), 'Late Local state must not leak into Mon')
    return { optIn: true, progress: true, cancel: true, retry: true, ready: true, worldIsolation: true }
  } finally { root.unmount() }
}
Object.assign(window, { runModelTests })
