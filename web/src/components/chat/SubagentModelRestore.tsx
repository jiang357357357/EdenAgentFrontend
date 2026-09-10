import { useEffect, useState } from 'react'
import type { SubagentModelRecoveryPlan } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { SubagentParentActor } from './SubagentParentActor'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'

export function SubagentModelRestore({ agentId, onSaved }: { agentId: string; onSaved: () => Promise<void> }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [plan, setPlan] = useState<SubagentModelRecoveryPlan | null>(null)
  const [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [source, setSource] = useState<{ parentSessionId: string; actorId: string | null } | null>(null)
  const [actorId, setActorId] = useState('')
  useEffect(() => {
    let active = true
    void rpcRequestForOrigin(origin, 'agent.recovery.model.sources', { agentId }).then(value => {
      if (active) { setSource({ ...value, actorId: value.actorId ?? null }); setActorId(value.actorId ?? '') }
    }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [origin, agentId])
  async function preview() {
    setBusy(true); setError(''); setPlan(null); setConfirmed(false)
    try { setPlan(await rpcRequestForOrigin(origin, 'agent.recovery.model.preview', { agentId, ...(actorId ? { actorId } : {}) })) }
    catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  async function apply() {
    if (!plan || !confirmed) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin(origin, 'agent.recovery.model.apply', { agentId, ...(plan.actorId === null ? {} : { actorId: plan.actorId }), fingerprint: plan.fingerprint, note, confirmOwnership: true })
      await onSaved(); setPlan(null); setConfirmed(false)
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>确认旧任务恢复使用的模型</summary>
    <p>使用当前父会话绑定，并应用已固定角色的模型与推理设置。请核对该选择适合原任务；历史凭据不会自动恢复。</p>
    {source && <SubagentParentActor key={source.parentSessionId} sessionId={source.parentSessionId} value={actorId} disabled={busy} onChange={value => { setActorId(value); setPlan(null); setConfirmed(false) }} />}
    <p>旧任务必须已恢复为所选角色的单角色上下文。来源选择随模型确认保存，单独选择不会激活配置。</p>
    <button disabled={busy} onClick={() => void preview()} className="my-2 rounded border px-2 py-1">预览恢复模型</button>
    {plan && <><dl className="break-all"><dt>世界</dt><dd>{plan.origin === 'mon' ? '伊甸园' : '尘世'}</dd>
      <dt>父角色来源</dt><dd>{plan.actorId ?? '父会话单模型绑定'}</dd><dt>模型</dt><dd>{plan.provider}/{plan.modelId}</dd><dt>服务地址</dt><dd>{plan.baseUrl}</dd>
      <dt>推理与容量</dt><dd>{plan.reasoning} · 上下文 {plan.contextWindow} · 最大输出 {plan.maxTokens}</dd></dl>
      <textarea aria-label="模型归属确认说明" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="说明原任务模型与当前选择的对应关系或替换理由" className="mt-2 w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我确认此模型归属与选择，可用于该旧任务的后续恢复。</label>
      <button disabled={busy || !confirmed || !note.trim()} onClick={() => void apply()} className="mt-2 rounded border px-2 py-1">保存模型恢复确认</button>
      <p>此操作保存待激活配置，不调用模型，不重开会话或重发任务。</p></>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
