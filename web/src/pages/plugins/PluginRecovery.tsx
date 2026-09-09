import { PluginRecoveryPermissions } from './PluginRecoveryPermissions'
import { useEffect, useRef, useState } from 'react'
import type { PluginPreviewInfo, SchemaRpcMethodMap } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
type Page = SchemaRpcMethodMap['plugin.recovery.list']['result']
export function PluginRecovery({ onPreview, disabled }: { onPreview: (preview: PluginPreviewInfo) => void; disabled: boolean }) {
  const [page, setPage] = useState<Page | null>(null), [after, setAfter] = useState<string | undefined>()
  const [permissionSource, setPermissionSource] = useState<string | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const origin = getStoredRuntimeOrigin(), mounted = useRef(true), locked = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let active = true
    setPage(null); setError('')
    if (!origin) return () => { active = false }
    void rpcRequestForOrigin(origin, 'plugin.recovery.list', { ...(after === undefined ? {} : { after }) })
      .then(value => { if (active) setPage(value) }, reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [origin, after])
  const inspect = async (sourceId: string) => {
    if (!origin || locked.current || disabled || getStoredRuntimeOrigin() !== origin) return
    locked.current = true; setBusy(true); setError('')
    try {
      const preview = await rpcRequestForOrigin(origin, 'plugin.recovery.inspect', { sourceId })
      if (mounted.current && getStoredRuntimeOrigin() === origin) onPreview(preview)
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  if (!error && page?.items.length === 0 && after === undefined) return null
  return <section className="mb-4 rounded-xl border p-4 text-sm">
    <h2 className="font-medium">恢复迁移前插件</h2>
    <p className="my-2 text-xs">副本需要核对文件、版本和签名后重新安装。旧权限不会自动授予；缺少文件时先运行迁移文件恢复步骤。</p>
    {error && <p role="alert">{error}</p>}
    {page?.items.map(item => <div key={item.sourceId} className="border-t py-2">
      <p>{item.pluginId} · {item.version} · {item.copied ? '已有恢复副本' : '待恢复文件'}</p>
      <p className="break-all font-mono text-xs">{item.revision}</p>
      <button type="button" onClick={() => setPermissionSource(value => value === item.sourceId ? null : item.sourceId)}>查看历史权限</button>
      {permissionSource === item.sourceId && <PluginRecoveryPermissions key={`${origin}:${item.sourceId}`} sourceId={item.sourceId} />}
      <button type="button" disabled={disabled || busy || !item.copied} onClick={() => void inspect(item.sourceId)}>检查并预览恢复副本</button>
    </div>)}
    {busy && <p role="status">正在检查恢复副本…</p>}
    {after !== undefined && <button type="button" disabled={busy} onClick={() => setAfter(undefined)}>返回首批</button>}
    {page?.nextCursor && <button type="button" disabled={busy} onClick={() => setAfter(page.nextCursor!)}>下一批</button>}
  </section>
}
