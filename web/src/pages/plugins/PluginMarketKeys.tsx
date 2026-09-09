import { useEffect, useState } from 'react'
import type { MarketKeyInfo } from '@eden/api'
import { addMarketKey, listMarketKeys, revokeMarketKey } from '../../lib/plugin-market-keys'
export function PluginMarketKeys({ onChanged }: { onChanged: () => Promise<void> }) {
  const [keys, setKeys] = useState<MarketKeyInfo[]>([])
  const [id, setId] = useState(''), [publicKey, setPublicKey] = useState('')
  const [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { let active = true; void listMarketKeys().then(value => { if (active) setKeys(value) }).catch(reason => { if (active) setError(String(reason)) }); return () => { active = false } }, [])
  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await work(); setKeys(await listMarketKeys()); await onChanged() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  return <details className="mb-4 rounded-xl border border-stone-200 bg-white p-4 text-sm">
    <summary className="cursor-pointer font-medium">市场可信公钥</summary>
    <p className="mt-2 text-xs text-stone-500">填写发行者提供的 Ed25519 公钥，并核对指纹。只需公钥，不要填写私钥。来源配置中的密钥 ID 必须与这里一致。</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <input aria-label="公钥 ID" disabled={busy} value={id} onChange={event => setId(event.target.value)} placeholder="密钥 ID" className="rounded border p-2" />
      <input aria-label="Base64 公钥" disabled={busy} value={publicKey} onChange={event => setPublicKey(event.target.value)} placeholder="32 字节公钥（Base64）" className="min-w-64 flex-1 rounded border p-2 font-mono" />
      <button disabled={busy || !id.trim() || !publicKey.trim()} onClick={() => void run(async () => { await addMarketKey(id.trim(), publicKey.trim()); setId(''); setPublicKey('') })} className="rounded border px-3 disabled:opacity-40">信任此公钥</button>
    </div>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    <div className="mt-3 space-y-2">{keys.map(key => <div key={key.id} className="rounded bg-stone-50 p-3 text-xs">
      <div className="flex items-center gap-2"><b>{key.id}</b><span>{key.enabled ? '已信任' : '已撤销'}</span>
        {key.enabled && <button disabled={busy} onClick={() => setConfirm(key.id)} className="ml-auto text-red-700">撤销信任</button>}
      </div>
      <p className="mt-1 break-all font-mono">SHA-256：{key.fingerprint}</p>
      {confirm === key.id && <div className="mt-2 flex flex-wrap gap-3"><span>撤销后将清除使用此密钥的市场缓存索引。</span>
        <button disabled={busy} onClick={() => void run(async () => { await revokeMarketKey(key.id); setConfirm('') })} className="text-red-700">确认撤销</button>
        <button disabled={busy} onClick={() => setConfirm('')}>取消</button>
      </div>}
    </div>)}</div>
  </details>
}
