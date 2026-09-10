import { useState } from 'react'
import type { ModelPricingTarget, ModelRates } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'

const fields = ['input', 'output', 'cacheRead', 'cacheWrite'] as const
const labels = { input: '输入', output: '输出', cacheRead: '缓存读取', cacheWrite: '缓存写入' }
interface Pricing { modelKey: string; provider: string; modelId: string; rates: ModelRates | null; revision: string | null }
export function ModelPricingPanel({ sessionId }: { sessionId: string }) {
  const [target, setTarget] = useState<ModelPricingTarget['target']>('main'), [assistantId, setAssistantId] = useState('')
  const [loaded, setLoaded] = useState<{ selection: ModelPricingTarget; info: Pricing } | null>(null)
  const [rates, setRates] = useState({ input: '', output: '', cacheRead: '', cacheWrite: '' })
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function load() {
    setBusy(true); setError(''); setLoaded(null)
    try {
      const selection: ModelPricingTarget = { sessionId, target, ...(['actor', 'actor_vision'].includes(target) ? { assistantId } : {}) }
      const info = await rpcRequestForOrigin('mon', 'model.pricing.read', selection)
      setLoaded({ selection, info: { ...info, rates: info.rates ?? null, revision: info.revision ?? null } }); setNote('')
      setRates({ input: info.rates ? String(info.rates.input) : '', output: info.rates ? String(info.rates.output) : '',
        cacheRead: info.rates ? String(info.rates.cacheRead) : '', cacheWrite: info.rates ? String(info.rates.cacheWrite) : '' })
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function save(clear: boolean) {
    if (!loaded) return
    setBusy(true); setError('')
    try {
      const value = clear ? null : { input: Number(rates.input), output: Number(rates.output), cacheRead: Number(rates.cacheRead), cacheWrite: Number(rates.cacheWrite) }
      const info = await rpcRequestForOrigin('mon', 'model.pricing.set', { selection: loaded.selection, expectedModelKey: loaded.info.modelKey,
        expectedRevision: loaded.info.revision, rates: value, note })
      setLoaded({ ...loaded, info: { ...info, rates: info.rates ?? null, revision: info.revision ?? null } }); setNote('')
      if (clear) setRates({ input: '', output: '', cacheRead: '', cacheWrite: '' })
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="mt-3 rounded border p-2">
    <summary>模型费用估算配置</summary>
    <p className="mt-2">单位为每百万 Token 的美元价格。请按供应商资料填写；估算不等于账单。配置供当前世界相同模型与端点共用，不改变已发出请求的计价。</p>
    <select aria-label="计价模型用途" disabled={busy} value={target} onChange={event => { setTarget(event.target.value as ModelPricingTarget['target']); setLoaded(null) }} className="mt-2 rounded border p-1">
      <option value="main">主模型</option><option value="vision">视觉模型</option><option value="director">导演模型</option><option value="actor">角色模型</option><option value="actor_vision">角色视觉模型</option>
    </select>
    {['actor', 'actor_vision'].includes(target) && <input aria-label="助手 ID" placeholder="助手 ID" disabled={busy} value={assistantId} onChange={event => { setAssistantId(event.target.value); setLoaded(null) }} className="ml-2 rounded border p-1" />}
    <button disabled={busy} onClick={() => void load()} className="ml-2 rounded border px-2 py-1">读取当前模型</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loaded && <div className="mt-2 space-y-2">
      <p>{loaded.info.provider}/{loaded.info.modelId} · {loaded.info.rates ? '已有单价' : '单价未知'}</p>
      {fields.map(field => <label key={field} className="block">{labels[field]} <input type="number" min={0} step="any" disabled={busy} value={rates[field]} onChange={event => setRates(previous => ({ ...previous, [field]: event.target.value }))} className="rounded border p-1" /></label>)}
      <textarea aria-label="单价来源说明" placeholder="单价来源、适用条件或清除原因" maxLength={4000} disabled={busy} value={note} onChange={event => setNote(event.target.value)} className="w-full rounded border p-2" />
      <button disabled={busy || !note.trim() || !fields.every(field => rates[field] !== '' && Number.isFinite(Number(rates[field])) && Number(rates[field]) >= 0)} onClick={() => void save(false)} className="rounded border px-2 py-1">保存估算单价</button>
      <button disabled={busy || !note.trim()} onClick={() => void save(true)} className="ml-2 rounded border px-2 py-1">清除单价，标记未知</button>
    </div>}
  </details>
}
