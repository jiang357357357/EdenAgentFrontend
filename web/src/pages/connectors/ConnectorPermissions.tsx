import type { ConnectorPermissionSnapshot as PermissionSnapshot } from '@eden/api'
import { useEffect, useRef, useState } from 'react'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
export function ConnectorPermissions({ id, revisionHint, onChanged }: { id: string; revisionHint: string; onChanged?: () => void }) {
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0)
  const epoch = useRef(0), origin = getStoredRuntimeOrigin()
  useEffect(() => {
    const current = ++epoch.current
    setSnapshot(null); setError(''); setBusy(false)
    void rpcRequestForOrigin(origin, 'connector.permissions.read', { id }).then(result => {
      if (epoch.current === current) setSnapshot(result)
    }, reason => { if (epoch.current === current) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { epoch.current++ }
  }, [id, origin, revisionHint, refresh])
  async function decide(key: string, allowed: boolean) {
    if (!snapshot || busy || getStoredRuntimeOrigin() !== origin) return
    const current = epoch.current
    setBusy(true); setError('')
    try {
      const result = await rpcRequestForOrigin(origin, 'connector.permissions.set', { id, generation: snapshot.generation, revision: snapshot.revision, decisions: [{ key, allowed }] })
      if (epoch.current === current) { setSnapshot(result); onChanged?.() }
    } catch (reason) { if (epoch.current === current) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { if (epoch.current === current) setBusy(false) }
  }
  return <section className="my-4 rounded-xl border border-stone-200 bg-white p-4 text-sm">
    <div className="flex justify-between"><h3 className="font-medium">连接器权限</h3>
      <button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>刷新</button></div>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {!snapshot && !error && <p className="mt-2 text-stone-500">读取权限中…</p>}
    {snapshot && <>
      <p className="mt-2 text-xs text-stone-500">授权仅适用于当前配置和包版本。修改配置后需重新授权；撤销权限会停用连接器。</p>
      <p className="mt-2 break-all">{snapshot.worker.available ? `Worker SHA-256：${snapshot.worker.sha256}` : '缺少当前平台的有效 worker，请先安装制品。'}</p>
      <p className="mt-2">{snapshot.ready ? '必需权限已允许；连接状态请查看上方。' : '必需权限尚未就绪。'}</p>
      {snapshot.permissions.length === 0 && <p>此连接器未声明额外权限。</p>}
      <ul className="mt-2 space-y-3">{snapshot.permissions.map(permission => <li key={permission.key} className="border-t pt-3">
        <p className="font-medium">{permission.capability} · {permission.required ? '必需' : '可选'}</p>
        <p>{permission.description}</p>
        <p className="break-all text-xs text-stone-500">资源：{permission.resolvedResource ?? '尚未配置'} · {permission.access}</p>
        <button type="button" className="mt-2 rounded border px-3 py-1" disabled={busy || (!permission.allowed && (permission.resolvedResource === null || !snapshot.worker.available))}
          onClick={() => void decide(permission.key, !permission.allowed)}>{permission.allowed ? '撤销允许' : '允许此权限'}</button>
      </li>)}</ul>
    </>}
  </section>
}
