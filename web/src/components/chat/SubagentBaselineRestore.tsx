import { useState } from 'react'
import type { SubagentBaselinePlan } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function SubagentBaselineRestore({ agentId, onSaved }: { agentId: string; onSaved: () => Promise<void> }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [plan, setPlan] = useState<SubagentBaselinePlan | null>(null)
  const [tokens, setTokens] = useState(''), [cost, setCost] = useState(''), [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function load() {
    setBusy(true); setError(''); setPlan(null); setConfirmed(false)
    try {
      const result = await rpcRequestForOrigin(origin, 'agent.recovery.usage.preview', { agentId })
      setPlan(result); setTokens(String(result.tokens)); setCost(String(result.costMicrousd))
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function save() {
    if (!plan || !confirmed) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin(origin, 'agent.recovery.usage.apply', { agentId, fingerprint: plan.fingerprint,
        tokens: Number(tokens), costMicrousd: Number(cost), note, confirmHistoricalTotal: true })
      await onSaved(); setPlan(null); setConfirmed(false)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>确认迁移前累计用量</summary>
    <p>从最深子任务向父级核对。先补齐新模型请求的账单，再填写迁移前累计总量；新账单单独保留，不能重复计入历史总量，也不能用零代替未知。</p>
    <button disabled={busy} onClick={() => void load()} className="my-2 rounded border px-2 py-1">读取历史累计值</button>
    {plan && <><p>另外保留的新账单：{plan.recordedTokens} Token，{plan.recordedCostMicrousd} 微美元。保存后与历史总量相加。</p><label className="block">Token 总量 <input type="number" min={plan.tokens} disabled={busy || !plan.tokensUnknown} value={tokens} onChange={event => { setTokens(event.target.value); setConfirmed(false) }} className="rounded border p-1" /></label>
      <label className="block">费用总量（微美元）<input type="number" min={plan.costMicrousd} disabled={busy || !plan.costUnknown} value={cost} onChange={event => { setCost(event.target.value); setConfirmed(false) }} className="rounded border p-1" /></label>
      <textarea aria-label="历史用量确认依据" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="说明历史记录来源与累计范围" className="mt-2 w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我已核对累计范围，确认上述总量及依据。</label>
      <button disabled={busy || !confirmed || tokens === '' || cost === '' || !note.trim()} onClick={() => void save()} className="mt-2 rounded border px-2 py-1">保存历史用量确认</button>
      <p>已知值保留，未知值只能补齐且不能减少已记录用量；发生增量后须继续核对祖先总量，不会自动重复累加。</p></>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
