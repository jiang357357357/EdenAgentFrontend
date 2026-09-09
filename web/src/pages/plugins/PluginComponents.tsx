import { PluginAssets } from "./PluginAssets"
import { useState } from 'react'
import { rpcRequest } from '../../lib/rpc-transport'
import type { ManagedPluginInfo as PluginInfo } from '@eden/api'
export function PluginComponents({ plugin, onChanged }: { plugin: PluginInfo; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await work(); await onChanged(); window.dispatchEvent(new Event('edenagent:skills-changed')) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  return <div className="mt-3 rounded border p-3 text-xs">
    <b>包组件</b>
    {plugin.components.map(component => <label key={component.id} className="mt-2 flex items-center gap-2">
      <input type="checkbox" disabled={busy} checked={(component as typeof component & { enabled?: boolean }).enabled ?? component.enabledByDefault}
        onChange={event => void run(() => rpcRequest('plugin.component.set', { id: plugin.id, revision: plugin.revision, componentId: component.id, enabled: event.target.checked }))} />
      {component.id} · {component.kind}
    </label>)}
    <label className="mt-3 block">当前选择版本
      <select className="ml-2 rounded border p-1" disabled={busy} value={plugin.revision} onChange={event => void run(() => rpcRequest('plugin.package.select', { id: plugin.id, revision: event.target.value }))}>
        {plugin.versions.map(version => <option key={version.revision} value={version.revision}>{version.version} · {version.revision.slice(0, 12)}</option>)}
      </select>
    </label>
    <p className="mt-2 text-stone-500">选择版本后插件保持停用，请审查权限与组件后再启用。</p>
    <PluginAssets key={`${plugin.id}:${plugin.revision}`} id={plugin.id} revision={plugin.revision} />
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
  </div>
}
