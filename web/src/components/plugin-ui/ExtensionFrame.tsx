import { useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { jsonValue, type JsonValue, type PluginUiCall } from '@eden/api'
import type { PluginUiHost, PluginUiCallOptions, PluginUiTool } from '@eden/plugin-sdk/ui'
import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import { webviewDocument } from '../../lib/extensions/webview-document'
import { invokeExtension } from '../../lib/extensions/extension-invocation'
import { usePluginUi } from './PluginUiProvider'
import { useExtensionWorkbenchActions } from './ExtensionWorkbenchContext'
import { extensionViewActions } from './extension-view-actions'
import { reportPluginUiDiagnostic } from '../../lib/plugin-ui-reports'
import { matchesContribution, matchesKeybinding } from '../../lib/extensions/contribution-context'
import { ExtensionContributionContext } from './ExtensionWorkbenchContext'
import { useDocumentLifecycle } from '../workbench/document-lifecycle'

const requestSchema = z.object({ type: z.literal('request'), id: z.string().max(128),
  method: z.enum(['command', 'message', 'session.read', 'session.send', 'tool.call', 'state', 'dirty', 'save.register', 'save.unregister', 'document.read', 'document.save', 'connector.subscribe', 'connector.unsubscribe', 'legacy.ready', 'legacy.failed', 'legacy.height']),
  input: z.record(z.string(), jsonValue) }).strict()
const diagnosticSchema = z.object({ type: z.literal('diagnostic'), entries: z.array(z.object({
  kind: z.enum(['error', 'unhandledrejection', 'console', 'network', 'csp']), message: z.string().min(1).max(2000) }).strict()).min(1).max(20) }).strict()
const shortcutSchema = z.object({ type: z.literal('shortcut'), key: z.string().max(80), ctrlKey: z.boolean(),
  metaKey: z.boolean(), altKey: z.boolean(), shiftKey: z.boolean(), editing: z.boolean() }).strict()

export function ExtensionFrame({ view, host, call, documentPath, tool, legacyDocument }: {
  view: PluginUiLoadedView; host: PluginUiHost; documentPath?: string; tool?: PluginUiTool; legacyDocument?: (theme: Record<string, string>) => string
  call(action: PluginUiCall['action'], input: Record<string, JsonValue>, options?: PluginUiCallOptions): Promise<JsonValue>
}) {
  const lifecycle=useDocumentLifecycle(),stateKey=view.module.revision+':'+view.view.id
  const frame = useRef<HTMLIFrameElement>(null), state = useRef<JsonValue>(lifecycle?.store.readViewState(lifecycle.id,stateKey)??null)
  const port = useRef<MessagePort | undefined>(undefined), currentTool = useRef(tool)
  currentTool.current = tool
  useLayoutEffect(() => { port.current?.postMessage({ type: 'message', message: { type: 'legacy.tool', tool } }) }, [tool])
  const [generation, setGeneration] = useState(0), [error, setError] = useState('')
  const [shortcutOperations,setShortcutOperations]=useState<{id:string;controller:AbortController}[]>([])
  const [shortcutError,setShortcutError]=useState('')
  const [height, setHeight] = useState(256)
  const { origin } = usePluginUi(), baseActions = useExtensionWorkbenchActions()
  const context=useContext(ExtensionContributionContext)
  const shortcuts=useRef<{key:string;command:string}[]>([])
  const bindingContext={...context,sessionAvailable:Boolean(host.sessionId),activeView:view.key}
  shortcuts.current=view.module.document.apiVersion===2?view.module.document.contributes.keybindings.filter(binding=>
    matchesContribution(binding.when,bindingContext)&&view.module.document.apiVersion===2&&view.module.document.contributes.commands.some(command=>command.id===binding.command&&matchesContribution(command.when,bindingContext))):[]
  useLayoutEffect(()=>{port.current?.postMessage({type:'keybindings',keys:shortcuts.current.map(binding=>binding.key)})})
  const connect = useRef<() => void>(() => {})
  const loaded = useRef(false)
  const connected = useRef(false)
  const frameKey = `${host.sessionId ?? ''}:${documentPath ?? ''}:${view.module.revision}:${generation}`
  const previousKey = useRef(frameKey)
  if (previousKey.current !== frameKey) { previousKey.current = frameKey; loaded.current = false; connected.current = false }
  const source = useMemo(() => {
    const css = getComputedStyle(document.documentElement), theme: Record<string, string> = {}
    for (const key of ['bg', 'text', 'accent', 'surface', 'border', 'danger', 'text-muted']) theme[`--color-${key}`] = css.getPropertyValue(`--color-${key}`)
    if (legacyDocument) return legacyDocument(theme)
    if (view.module.document.apiVersion !== 2 || !('entry' in view.view) || !view.view.entry) return ''
    return webviewDocument(view.resources?.[view.view.entry] ?? '', theme)
  }, [view, generation, legacyDocument])
  useLayoutEffect(() => {
    setShortcutOperations([]);setShortcutError('')
    if (error) return
    const lifetime = new AbortController(), signal = AbortSignal.any([host.signal, lifetime.signal])
    let channel: MessageChannel | undefined, unregisterSave: (() => void) | undefined, unsubscribeConnector: (() => void) | undefined
    const active = new Map<string, AbortController>(), saves = new Map<string, { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
    let activationTimer: ReturnType<typeof setTimeout> | undefined
    const actions = extensionViewActions(view, baseActions, host.sessionId)
    const releaseEvents = view.extension?.onView(event => {
      if (event.scope && (event.scope.sessionId !== host.sessionId || event.scope.instanceId && event.scope.instanceId !== view.instanceId)) return
      if (event.viewId === view.view.id && event.type === 'message') channel?.port1.postMessage({ type: 'message', message: event.message })
      if (event.viewId === view.view.id && event.type === 'configuration') channel?.port1.postMessage({ type: 'configuration', keys: event.message })
    })
    async function handle(method: z.infer<typeof requestSchema>['method'], input: Record<string, JsonValue>, operationSignal: AbortSignal): Promise<JsonValue> {
      if (method.startsWith('legacy.')) {
        if (view.legacySource === undefined) throw new Error('当前视图不是旧版扩展')
        if (method === 'legacy.ready' || method === 'legacy.failed') clearTimeout(activationTimer)
        if (method === 'legacy.failed') { const message = z.string().max(2000).parse(input.error); void reportPluginUiDiagnostic(origin, view.module, view.view.id, host.sessionId, [{ kind: 'error', message }]); setError(message) }
        if (method === 'legacy.height') setHeight(z.number().int().min(0).max(100000).parse(input.height))
        return null
      }
      if (method === 'connector.subscribe') {
        unsubscribeConnector ??= host.onConnectorEvent(event => channel?.port1.postMessage({ type: 'connector.event', event }))
        channel?.port1.postMessage({ type: 'connector.event', event: { type: 'resync' } })
      }
      if (method === 'connector.unsubscribe') { unsubscribeConnector?.(); unsubscribeConnector = undefined }
      if (method === 'command') return invokeExtension(view, origin, host.sessionId, 'command', z.string().parse(input.id), z.array(jsonValue).max(32).parse(input.arguments ?? []), actions, operationSignal)
      if (method === 'message') return invokeExtension(view, origin, host.sessionId, 'message', view.view.id, [input.message ?? null], actions, operationSignal)
      if (method === 'session.read') return call('session.read', {}, { signal: operationSignal })
      if (method === 'session.send') return call('session.send', { text: z.string().parse(input.text) }, { signal: operationSignal })
      if (method === 'tool.call') return call('tool.call', { name: z.string().parse(input.name), input: z.record(z.string(), jsonValue).parse(input.input) }, { signal: operationSignal })
      if (method === 'state') { const bytes = JSON.stringify(input.value ?? null); if (bytes.length > 262144) throw new Error('页面状态过大'); state.current = input.value ?? null;if(lifecycle)lifecycle.store.writeViewState(lifecycle.id,stateKey,state.current) }
      if (method === 'dirty') host.setDirty?.(z.boolean().parse(input.dirty))
      if (method === 'document.read' || method === 'document.save') {
        if (!documentPath) throw new Error('当前页面没有绑定文档')
        return call(method, { ...input, path: documentPath }, { signal: operationSignal })
      }
      if (method === 'save.unregister') { unregisterSave?.(); unregisterSave = undefined }
      if (method === 'save.register') {
        unregisterSave?.()
        unregisterSave = host.registerSave?.(() => new Promise<void>((resolve, reject) => {
          const id = crypto.randomUUID(), timer = setTimeout(() => { saves.delete(id); reject(new Error('页面保存超时')) }, 120000)
          saves.set(id, { resolve, reject, timer }); channel?.port1.postMessage({ type: 'save', id })
        }))
      }
      return null
    }
    connect.current = () => {
      channel?.port1.close(); channel = new MessageChannel(); port.current = channel.port1
      channel.port1.onmessage = async event => {
        if (event.data?.type === 'cancel' && typeof event.data.id === 'string') { active.get(event.data.id)?.abort(); return }
        const diagnostic = diagnosticSchema.safeParse(event.data)
        const shortcut = shortcutSchema.safeParse(event.data)
        if (shortcut.success && !signal.aborted) {
          const binding=shortcuts.current.find(binding=>matchesKeybinding(binding.key,shortcut.data))
          if(binding){
            const operation={id:crypto.randomUUID(),controller:new AbortController()};setShortcutError('');setShortcutOperations(current=>[...current,operation])
            try{await handle('command',{id:binding.command},AbortSignal.any([signal,operation.controller.signal]))}catch(reason){if(!signal.aborted)setShortcutError(String(reason));actions.message(String(reason),'error')}
            finally{if(!signal.aborted)setShortcutOperations(current=>current.filter(item=>item.id!==operation.id))}
          }
          return
        }
        if (diagnostic.success && !signal.aborted) {
          void reportPluginUiDiagnostic(origin, view.module, view.view.id, host.sessionId, diagnostic.data.entries)
          return
        }
        if (event.data?.type === 'saved' && typeof event.data.id === 'string') {
          const saved = saves.get(event.data.id); if (!saved) return
          saves.delete(event.data.id); clearTimeout(saved.timer)
          event.data.error ? saved.reject(new Error(String(event.data.error))) : saved.resolve(); return
        }
        const parsed = requestSchema.safeParse(event.data)
        if (!parsed.success || signal.aborted) return
        const { id, method, input } = parsed.data
        if (active.has(id) || active.size >= 64) return
        const operation = new AbortController(); active.set(id, operation)
        try { const result = await handle(method, input, AbortSignal.any([signal, operation.signal])); if (!signal.aborted) channel?.port1.postMessage({ type: 'result', id, result }) }
        catch (reason) { if (!signal.aborted) channel?.port1.postMessage({ type: 'result', id, error: String(reason).slice(0, 4000) }) }
        finally { active.delete(id) }
      }
      const iframe=frame.current,owner=iframe?.ownerDocument.defaultView
      const message={ type: 'eden-extension-connect', context: { viewId: view.view.id,
        sessionId: host.sessionId, state: state.current, documentPath, tool: currentTool.current } }
      if(owner&&owner!==window)owner.postMessage({type:'eden-floating-frame-connect',message},'*',[channel.port2])
      else iframe?.contentWindow?.postMessage(message, '*', [channel.port2])
      channel.port1.postMessage({type:'keybindings',keys:shortcuts.current.map(binding=>binding.key)})
      if (view.legacySource !== undefined) activationTimer = setTimeout(() => setError('旧版扩展激活超时，已关闭页面'), 10000)
    }
    void view.extension?.activate().catch(reason => setError(String(reason)))
    if (loaded.current) connect.current()
    return () => {
      lifetime.abort(); clearTimeout(activationTimer); connect.current = () => {}; channel?.port1.close(); port.current = undefined; unregisterSave?.(); unsubscribeConnector?.(); releaseEvents?.()
      for (const saved of saves.values()) { clearTimeout(saved.timer); saved.reject(new Error('页面已关闭')) }
    }
  }, [view, host, call, documentPath, origin, baseActions, generation, error])
  if (error) return <div role="alert" className="p-4 text-danger">{error}<button onClick={() => { setError(''); setGeneration(value => value + 1) }}>重新加载页面</button></div>
  return <>{shortcutError&&<p role="alert" className="px-3 py-2 text-danger">{shortcutError}</p>}{shortcutOperations.map(operation=><div role="status" key={operation.id} className="flex items-center justify-between border-b border-border px-3 py-2"><span>正在执行快捷键命令…</span><button onClick={()=>operation.controller.abort()}>取消命令</button></div>)}<iframe key={frameKey} ref={frame} title={view.view.title} className={view.legacySource === undefined ? 'h-full min-h-64 w-full border-0' : 'w-full border-0'} style={view.legacySource === undefined ? undefined : { height: Math.max(height, 64) }} sandbox="allow-scripts allow-forms" srcDoc={source} onLoad={() => {
    if (connected.current) { setError('扩展页面离开获准文档，已断开连接。'); return }
    connected.current = true; loaded.current = true; connect.current()
  }} /></>
}
