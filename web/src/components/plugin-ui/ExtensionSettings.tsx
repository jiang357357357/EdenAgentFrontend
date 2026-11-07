import { useEffect, useRef, useState } from 'react'
import type { JsonValue } from '@eden/api'
import { usePluginUi } from './PluginUiProvider'
import { createPluginUiHost } from '../../lib/plugin-ui-host'
import type { LoadedExtension, PluginUiLoadedView } from '../../lib/plugin-ui-runtime'

export function ExtensionSettings({ onClose, sessionId: boundSessionId }: { onClose(): void; sessionId?: string }) {
  const { extensions, origin, sessionId: activeSessionId } = usePluginUi(), dialog = useRef<HTMLDialogElement>(null)
  const sessionId = boundSessionId ?? activeSessionId
  const [scope, setScope] = useState<'global' | 'workspace'>('global'), [error, setError] = useState('')
  const [values, setValues] = useState<Record<string, { value: JsonValue; revision: number }>>({}), [busy, setBusy] = useState(false)
  const controller = useRef(new AbortController())
  // A modal top layer would cover the application's approval overlay in restricted mode.
  useEffect(() => { controller.current = new AbortController(); dialog.current?.show(); return () => { dialog.current?.close(); controller.current.abort() } }, [])
  async function access(extension: LoadedExtension, input: Record<string, JsonValue>) {
    const view: PluginUiLoadedView = { key: '$settings', module: extension.module, view: { id: '$extension', slot: 'page', title: '扩展设置', toolNames: [] }, signal: controller.current.signal, Component: () => null }
    const binding = createPluginUiHost(view, origin, sessionId)
    try { return await binding.call('extension.state', { namespace: 'configuration', scope, ...input }) as unknown as { value: JsonValue; revision: number } }
    finally { binding.close() }
  }
  useEffect(() => {
    let active = true
    setValues({}); setBusy(true); setError('')
    const load = async () => {
      const next: typeof values = {}
      for (const extension of extensions) if (extension.module.document.apiVersion === 2)
        for (const key of Object.keys(extension.module.document.contributes.configuration)) next[`${extension.module.pluginId}/${extension.module.componentId}/${key}`] = await access(extension, { key })
      if (active) setValues(next)
    }
    void load().catch(reason => { if (active) setError(String(reason)) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [extensions, scope, sessionId])
  async function save(extension: LoadedExtension, key: string, value: JsonValue) {
    const id = `${extension.module.pluginId}/${extension.module.componentId}/${key}`
    if (!values[id]) return
    setBusy(true); setError('')
    try { const result = await access(extension, { key, value, expectedRevision: values[id].revision }); setValues(current => ({ ...current, [id]: result })); extension.controller.configurationChanged([key]) }
    catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} aria-label="扩展设置" aria-modal="false" className="fixed inset-x-0 top-[8vh] z-50 max-h-[85vh] w-[min(90vw,700px)] overflow-auto rounded-lg border border-border bg-surface p-5 text-text shadow-xl" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }} onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="flex justify-between"><h2>扩展设置</h2><button onClick={onClose}>关闭</button></header>
    <label>保存范围 <select value={scope} disabled={busy} onChange={event => setScope(event.target.value as typeof scope)}><option value="global">当前账号</option><option value="workspace">当前工作区</option></select></label>
    {busy && <p role="status">正在读写设置…</p>}{error && <p role="alert" className="text-danger">{error}</p>}
    {extensions.map(extension => extension.module.document.apiVersion === 2 && <fieldset className="my-4 border-t border-border pt-3" key={`${extension.module.pluginId}/${extension.module.componentId}`}><legend>{extension.module.pluginName}</legend>
      {Object.entries(extension.module.document.contributes.configuration).map(([key, setting]) => {
        const id = `${extension.module.pluginId}/${extension.module.componentId}/${key}`, value = values[id]?.value ?? setting.default
        return <label key={key} className="my-3 block">{setting.title}<small className="block text-text-muted">{setting.description}</small>
          {setting.enum ? <select aria-label={setting.title} disabled={busy || !values[id]} value={JSON.stringify(value)} onChange={event => void save(extension, key, JSON.parse(event.target.value))}>{setting.enum.map(item => <option key={JSON.stringify(item)} value={JSON.stringify(item)}>{String(item)}</option>)}</select>
            : setting.type === 'boolean' ? <input aria-label={setting.title} disabled={busy || !values[id]} type="checkbox" checked={Boolean(value)} onChange={event => void save(extension, key, event.target.checked)} />
              : <input key={id + ':' + values[id]?.revision} aria-label={setting.title} className="block w-full rounded border border-border bg-bg p-2" disabled={busy || !values[id]} type={setting.type === 'number' ? 'number' : 'text'} defaultValue={String(value)} onBlur={event => { const next = setting.type === 'number' ? Number(event.target.value) : event.target.value; if (next !== value) void save(extension, key, next) }} />}
        </label>
      })}</fieldset>)}
  </dialog>
}
