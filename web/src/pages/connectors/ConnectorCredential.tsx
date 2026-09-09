import type { ConnectorCredentialStatus as CredentialStatus } from '@eden/api'
import { useEffect, useRef, useState } from 'react'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function ConnectorCredential({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const [status, setStatus] = useState<CredentialStatus | null>(null)
  const [secret, setSecret] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0), epoch = useRef(0), origin = getStoredRuntimeOrigin()
  useEffect(() => {
    const current = ++epoch.current
    setStatus(null); setSecret(''); setError(''); setBusy(false)
    void rpcRequestForOrigin(origin, 'connector.credential.read', { id }).then(value => {
      if (current === epoch.current) setStatus(value)
    }, () => { if (current === epoch.current) setError('读取凭据状态失败，请刷新。') })
    return () => { epoch.current++ }
  }, [id, origin, refresh])
  async function change(remove: boolean) {
    if (!status || busy || getStoredRuntimeOrigin() !== origin || (!remove && !secret)) return
    const current = epoch.current
    setBusy(true); setError('')
    const value = secret
    setSecret('')
    try {
      const next = remove
        ? await rpcRequestForOrigin(origin, 'connector.credential.remove', { id, generation: status.generation })
        : await rpcRequestForOrigin(origin, 'connector.credential.set', { id, generation: status.generation, secret: value })
      if (current === epoch.current) { setStatus(next); onChanged?.() }
    } catch { if (current === epoch.current) setError('凭据未确认更新。请刷新状态后重试；配置可能已变更。') }
    finally { if (current === epoch.current) setBusy(false) }
  }
  if (status && !status.supported) return null
  return <section className="my-4 rounded-xl border border-stone-200 bg-white p-4 text-sm">
    <div className="flex justify-between"><h3 className="font-medium">身份凭据</h3>
      <button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>刷新</button></div>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {status && <>
      <p className="mt-2">{status.configured ? '已配置私有凭据' : '尚未配置凭据'}</p>
      <p className="mt-2 text-xs text-stone-500">凭据只用于当前世界的此身份。修改后连接器将停用，需要重新授权并启用。</p>
      <label className="mt-3 block">令牌或 Admin 密码
        <input type="password" autoComplete="new-password" spellCheck={false} maxLength={16384} value={secret}
          disabled={busy} onChange={event => setSecret(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" /></label>
      <div className="mt-3 flex gap-3">
        <button type="button" disabled={busy || !secret} onClick={() => void change(false)}>保存凭据</button>
        <button type="button" disabled={busy || !status.configured} onClick={() => void change(true)}>删除凭据</button>
      </div>
    </>}
  </section>
}
