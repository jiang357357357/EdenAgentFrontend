import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import type { PluginUiHost, PluginUiTool, PluginUiOperation } from '@eden/plugin-sdk/ui'
import type { PluginUiLoadedView } from '../../lib/plugin-ui-runtime'
import { createPluginUiHost } from '../../lib/plugin-ui-host'
import { usePluginUi } from './PluginUiProvider'
import { reportPluginUi } from '../../lib/plugin-ui-reports'
import { useDocumentLifecycle } from '../workbench/document-lifecycle'
import { ExtensionFrame } from './ExtensionFrame'
import { ExtensionTree } from './ExtensionTree'
import { ExtensionViewToolbar } from './ExtensionViewToolbar'
const LegacyFrame = lazy(() => import('./LegacyFrame'))

class ViewBoundary extends Component<{ children: ReactNode; title: string; onError: (message: string) => void }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  componentDidCatch(error: Error, _info: ErrorInfo) { this.props.onError(error.message) }
  render() {
    if (!this.state.error) return this.props.children
    return <div role="alert" className="rounded-lg border border-danger/30 bg-danger-dim p-3 text-sm text-danger">
      <p>{this.props.title}暂时无法显示：{this.state.error}</p>
      <button className="mt-2 underline" onClick={() => this.setState({ error: '' })}>重新加载视图</button>
    </div>
  }
}
export function PluginUiView({ view: sourceView, tool, documentPath }: { view: PluginUiLoadedView; tool?: PluginUiTool; documentPath?: string }) {
  const instanceId = useRef(crypto.randomUUID())
  const view = useMemo(() => ({ ...sourceView, instanceId: instanceId.current }), [sourceView])
  const { origin, sessionId } = usePluginUi()
  const lifecycle = useDocumentLifecycle(), store = lifecycle?.store, documentId = lifecycle?.id
  const [host, setHost] = useState<PluginUiHost>()
  const [operations, setOperations] = useState<PluginUiOperation[]>([])
  const cancelOperation = useRef<(id: string) => void>(() => {})
  const callRef = useRef<ReturnType<typeof createPluginUiHost>['call'] | undefined>(undefined)
  const call = useCallback<ReturnType<typeof createPluginUiHost>['call']>((...args) => {
    if (!callRef.current) return Promise.reject(new Error('页面宿主尚未连接'))
    return callRef.current(...args)
  }, [])
  useEffect(() => {
    setOperations([])
    const binding = createPluginUiHost(view, origin, sessionId, {
      setDirty: dirty => { if (store && documentId) store.dirty(documentId, dirty) },
      registerSave: save => store && documentId ? store.register(documentId, { save }) : () => {},
      onOperations: setOperations,
    })
    cancelOperation.current = binding.cancel
    callRef.current = binding.call
    setHost(binding.host)
    return binding.close
  }, [view, origin, sessionId, store, documentId, documentPath])
  if (!host || host.signal.aborted || host.sessionId !== sessionId) return null
  const View = view.Component
  return <>{operations.filter(item => item.state !== 'starting').map(item => <div key={item.id} role="status"
    className="flex items-center justify-between gap-3 border-b border-border bg-surface px-3 py-2 text-sm text-text-muted">
    <span>{item.state === 'waiting' ? '正在等待当前会话空闲…' : item.state === 'approval' ? '正在等待操作审批…' : '正在执行操作…'}</span>
    <button type="button" className="shrink-0 rounded px-2 py-1 text-text hover:bg-surface-hover" onClick={() => cancelOperation.current(item.id)}>取消操作</button>
  </div>)}<ViewBoundary key={`${view.key}:${view.module.revision}:${sessionId ?? ''}`} title={view.view.title}
    onError={message => { void reportPluginUi(origin, view.module, 'failed', view.view.id, message) }}>
    {view.extension ? <><ExtensionViewToolbar view={view} host={host}/>{'renderer' in view.view && view.view.renderer === 'tree' ? <ExtensionTree view={view} host={host} />
      : <ExtensionFrame view={view} host={host} call={call} documentPath={documentPath} />}</> : view.legacySource !== undefined
        ? <Suspense fallback={<p role="status">正在加载扩展…</p>}><LegacyFrame view={view} host={host} call={call} tool={tool} /></Suspense> : <View host={host} {...(tool ? { tool } : {})} />}
    <MountedReport view={view} />
  </ViewBoundary></>
}
function MountedReport({ view }: { view: PluginUiLoadedView }) {
  const { origin } = usePluginUi()
  useEffect(() => {
    const report = () => { void reportPluginUi(origin, view.module, 'mounted', view.view.id) }
    report()
    const timer = setInterval(report, 30_000)
    return () => { clearInterval(timer); void reportPluginUi(origin, view.module, 'unmounted', view.view.id) }
  }, [origin, view])
  return null
}
export function PluginUiSlot({ slot, tool }: { slot: 'tool_card'; tool?: PluginUiTool }) {
  const { views } = usePluginUi()
  return <>{views.filter(item => item.view.slot === slot && tool && item.view.toolNames.includes(tool.name)).map(item =>
    <PluginUiView key={`${item.key}:${item.module.revision}`} view={item} tool={tool} />)}</>
}
