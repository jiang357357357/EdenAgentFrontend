import { useEffect, useRef, useState } from 'react'
import { packageAssetInfoSchema, packageAssetExportResultSchema } from '@eden/api'
import type { PackageAssetInfo, PackageAssetExport } from '@eden/api'
import { rpcRequest, resolveVoiceBlobUrl } from '../../lib/rpc-transport'
import { ObjectUrlScope } from '../../lib/object-url-scope'

export function PluginAssets({ id, revision }: { id: string; revision: string }) {
  const [assets, setAssets] = useState<PackageAssetInfo[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState('')
  const scope = useRef<ObjectUrlScope | null>(null)
  useEffect(() => {
    const current = new ObjectUrlScope(); scope.current = current
    let active = true
    const changed = () => { active = false; current.dispose(); setAssets([]); setError('世界已切换，请重新打开插件资源') }
    window.addEventListener('edenagent:runtime-origin-changed', changed)
    void rpcRequest('plugin.asset.list', { id, revision }).then(result => { if (active) setAssets(packageAssetInfoSchema.array().parse(result)) }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false; current.dispose(); if (scope.current === current) scope.current = null; window.removeEventListener('edenagent:runtime-origin-changed', changed) }
  }, [id, revision])
  async function download(asset: PackageAssetInfo) {
    const current = scope.current
    if (!current) return
    setBusy(asset.source); setError('')
    try {
      const result = packageAssetExportResultSchema.parse(await rpcRequest('plugin.asset.export', { id, revision, source: asset.source }))
      const url = await resolveVoiceBlobUrl(result.blob.id, current)
      if (scope.current !== current) return
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = asset.target.split('/').at(-1) || 'plugin-asset'
      anchor.click()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy('') }
  }
  return <details className="mt-3 text-xs"><summary className="cursor-pointer">声明资源（{assets.length}）</summary>
    <p className="mt-2 text-stone-500">可导出审查。目标业务的自动安装尚未接入，导出不会覆盖应用资源。</p>
    {assets.map(asset => <div key={`${asset.source}:${asset.targetKind}:${asset.target}`} className="mt-2 flex gap-2 rounded bg-stone-50 p-2">
      <div className="min-w-0 flex-1 break-all"><b>{asset.source}</b><p>{asset.targetKind} / {asset.target} · {asset.byteLength} B</p><p className="font-mono text-stone-500">{asset.sha256}</p></div>
      <button disabled={Boolean(busy)} onClick={() => void download(asset)}>{busy === asset.source ? '导出中' : '导出文件'}</button>
    </div>)}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
  </details>
}
