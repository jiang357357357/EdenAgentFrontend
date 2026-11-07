import { useState } from 'react'
import { PackagePlus } from 'lucide-react'
import type { PluginPreviewInfo } from '@eden/api'
import { inspectPlugin, installPlugin } from '../../lib/agent-client'
import { PluginPackagePreview } from './PluginPackagePreview'
import type { PluginActionRunner } from './plugin-page-types'

export function PluginInstaller({ preview, onPreview, busy, run, onInstalled }: {
  preview: PluginPreviewInfo | null; onPreview(value: PluginPreviewInfo | null): void
  busy: boolean; run: PluginActionRunner; onInstalled(id: string): void
}) {
  const [source, setSource] = useState('')
  return <div className="plugin-settings-view">
    <h2>安装插件</h2><p className="plugin-view-description">检查本地插件目录，或到插件市场选择版本，再审阅来源、组件和权限。</p>
    <label className="plugin-field">本地插件目录<div className="plugin-install-source"><input aria-label="本地插件目录" value={source} disabled={busy} onChange={event => { setSource(event.target.value); onPreview(null) }} placeholder="输入包含 plugin.json 的目录"/>
      <button disabled={busy || !source.trim()} onClick={() => void run(async () => onPreview(await inspectPlugin(source.trim())))}>检查目录</button></div></label>
    {preview ? <><PluginPackagePreview preview={preview}/><div className="plugin-install-actions"><button className="plugin-primary-action" disabled={busy} onClick={() => void (async () => {
      if (await run(() => installPlugin(preview.previewID))) { onPreview(null); setSource(''); onInstalled(preview.id) }
    })()}><PackagePlus size={16}/>安装此插件</button><button disabled={busy} onClick={() => onPreview(null)}>取消预览</button></div>
      <p className="plugin-view-description">安装后保持停用，在已安装列表中审阅权限和组件后启用。</p></> : <div className="plugin-view-empty">检查本地目录或选择市场版本后，在这里查看安装预览。</div>}
  </div>
}
