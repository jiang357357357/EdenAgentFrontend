import { useEffect, useState } from 'react'
import type { SchemaRpcMethodMap } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
type Page = SchemaRpcMethodMap['plugin.recovery.permissions']['result']
export function PluginRecoveryPermissions({ sourceId }: { sourceId: string }) {
  const [page, setPage] = useState<Page | null>(null), [error, setError] = useState('')
  const [after, setAfter] = useState<string | undefined>(), [revision, setRevision] = useState(0)
  const origin = getStoredRuntimeOrigin()
  useEffect(() => {
    let active = true
    setPage(null); setError('')
    if (!origin) return () => { active = false }
    void rpcRequestForOrigin(origin, 'plugin.recovery.permissions', { sourceId, ...(after === undefined ? {} : { after }) })
      .then(value => { if (active) setPage(value) }, reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [sourceId, origin, after, revision])
  return <div className="my-2 space-y-2 rounded border p-2 text-xs">
    <p>旧决定仅供核对。安装后请在插件权限区域重新保存决定；相同版本的明确决定才会记为已审阅。</p>
    {error && <p role="alert">{error}</p>}
    {page?.items.length === 0 && <p>本页没有历史权限记录。</p>}
    {page?.items.map(item => <div key={item.sourceId} className="break-all border-t pt-1">
      <p>{item.capability} · {item.resource || '未指定资源'} · {item.access}</p>
      <p>原决定：{item.originalDecision === 'allowed' ? '允许' : '拒绝'} · {item.matchesVersion ? '属于此版本' : '属于其他历史版本'}</p>
      <p>{item.currentDecision ? `已重新确认：${item.currentDecision === 'allowed' ? '允许' : '拒绝'}` : '尚未重新确认'}</p>
    </div>)}
    <button type="button" onClick={() => setRevision(value => value + 1)}>刷新权限恢复状态</button>
    {after !== undefined && <button type="button" onClick={() => setAfter(undefined)}>首批权限</button>}
    {page?.nextCursor && <button type="button" onClick={() => setAfter(page.nextCursor!)}>更多权限</button>}
  </div>
}
