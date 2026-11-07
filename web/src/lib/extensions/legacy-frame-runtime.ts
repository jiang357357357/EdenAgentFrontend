import * as React from 'react'
import { createRoot } from 'react-dom/client'
import type { PluginUiApi, PluginUiEntrypoint, PluginUiHost, PluginUiTool } from '@eden/plugin-sdk/ui'

interface LegacyBridge {
  sessionId?: string
  request(method: string, input: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>
  readSession: PluginUiHost['readSession']; sendMessage: PluginUiHost['sendMessage']; callTool: PluginUiHost['callTool']
  setDirty(dirty: boolean): void
  onConnectorEvent(listener: Parameters<PluginUiHost['onConnectorEvent']>[0]): { dispose(): void }
  registerSave(save: () => Promise<void>): { dispose(): void }
  tool?: PluginUiTool
  onDidReceiveMessage(listener: (message: unknown) => void): { dispose(): void }
}
declare function acquireEdenApi(): Promise<LegacyBridge>

export async function mount(input: { source: string; viewId: string; views: string[]; tool?: PluginUiTool }) {
  const bridge = await acquireEdenApi(), lifetime = new AbortController(), cleanups: (() => void)[] = []
  const root = createRoot(document.getElementById('legacy-root')!)
  const effect: PluginUiApi['effect'] = setup => {
    lifetime.signal.throwIfAborted()
    const cleanup = setup()
    if (typeof cleanup !== 'function') throw new Error('插件 effect 必须返回清理函数')
    let active = true
    const once = () => { if (active) { active = false; cleanup() } }
    cleanups.push(once); return once
  }
  const registered = new Map<string, React.ComponentType<import('@eden/plugin-sdk/ui').PluginUiViewProps>>()
  const api: PluginUiApi = { React, signal: lifetime.signal, effect,
    registerView: (id, component) => effect(() => {
      if (!input.views.includes(id) || registered.has(id)) throw new Error(`未声明或重复的插件视图：${id}`)
      registered.set(id, component); return () => { registered.delete(id) }
    }),
    addStyle: css => effect(() => {
      if (css.length > 128 * 1024) throw new Error('插件样式超过大小限制')
      const style = document.createElement('style'); style.textContent = css; document.head.append(style)
      return () => style.remove()
    }),
  }
  const host: PluginUiHost = Object.freeze({ sessionId: bridge.sessionId, signal: lifetime.signal,
    readSession: bridge.readSession, sendMessage: bridge.sendMessage, callTool: bridge.callTool,
    onConnectorEvent: (listener: Parameters<PluginUiHost['onConnectorEvent']>[0]) => effect(() => {
      const subscription = bridge.onConnectorEvent(listener); return () => subscription.dispose()
    }),
    setDirty: bridge.setDirty,
    registerSave: (save: () => Promise<void>) => effect(() => { const subscription = bridge.registerSave(save); return () => subscription.dispose() }),
  })
  const dispose = () => {
    lifetime.abort(); root.unmount()
    for (const cleanup of cleanups.splice(0).reverse()) { try { cleanup() } catch (error) { console.error(error) } }
  }
  window.addEventListener('pagehide', dispose, { once: true })
  try {
    const url = URL.createObjectURL(new Blob([input.source], { type: 'text/javascript' }))
    let entry: PluginUiEntrypoint
    try { entry = await import(/* @vite-ignore */ url) } finally { URL.revokeObjectURL(url) }
    if (typeof entry.activate !== 'function') throw new Error('前端模块必须导出 activate(api)')
    const cleanup = entry.activate(Object.freeze(api))
    if (cleanup !== undefined && typeof cleanup !== 'function') throw new Error('activate 必须同步返回清理函数或 undefined')
    if (cleanup) cleanups.push(cleanup)
    if (input.views.some(id => !registered.has(id))) throw new Error('未注册声明的视图')
    const render = (tool?: PluginUiTool) => root.render(React.createElement(registered.get(input.viewId)!, { host, ...(tool ? { tool } : {}) }))
    render(bridge.tool ?? input.tool)
    const updates = bridge.onDidReceiveMessage(message => {
      if (message && typeof message === 'object' && 'type' in message && message.type === 'legacy.tool')
        render((message as { tool?: PluginUiTool }).tool)
    })
    cleanups.push(() => updates.dispose())
    await bridge.request('legacy.ready', {})
    const observer = new ResizeObserver(() => { void bridge.request('legacy.height', { height: document.body.scrollHeight }).catch(console.error) })
    observer.observe(document.body); cleanups.push(() => observer.disconnect())
  } catch (error) {
    dispose(); document.body.textContent = `扩展加载失败：${String(error)}`
    await bridge.request('legacy.failed', { error: String(error).slice(0, 2000) })
  }
}
