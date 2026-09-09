import { useEffect, useState } from 'react'
import { useRuntimeOrigin } from '../../lib/use-runtime-origin'
import { useScopedRpc } from '../../lib/use-scoped-rpc'
import type { AgentThreadInfo } from '@eden/api'
import { SubagentRequestReview } from './SubagentRequestReview'
import { SubagentRoleEditor } from './SubagentRoleEditor'
import { SubagentWorkspaceRestore } from './SubagentWorkspaceRestore'
import { SubagentRecoveryPanel } from './SubagentRecoveryPanel'
import { SubagentPolicyRestore } from './SubagentPolicyRestore'
import { SubagentModelRestore } from './SubagentModelRestore'
import { SubagentBaselineRestore } from './SubagentBaselineRestore'
import { SubagentReopenRestore } from './SubagentReopenRestore'
import { SubagentDeadlineRestore } from './SubagentDeadlineRestore'
import { SubagentMailboxRestore } from './SubagentMailboxRestore'
import { InputOutcomeReview } from './InputOutcomeReview'
import { JobOutcomeReview } from './JobOutcomeReview'
import { MonChildModels } from './MonChildModels'
import { LocalModelProfiles } from './LocalModelProfiles'
import { SubagentParentActor } from './SubagentParentActor'
import { SubagentJobResubmit } from './SubagentJobResubmit'
export function SubagentPanel({ sessionId }: { sessionId: string }) {
  const origin = useRuntimeOrigin()
  return <ScopedSubagentPanel key={`${origin}:${sessionId}`} sessionId={sessionId} />
}
function ScopedSubagentPanel({ sessionId }: { sessionId: string }) {
  const rpcRequest = useScopedRpc()
  const [open, setOpen] = useState(false), [agents, setAgents] = useState<AgentThreadInfo[]>([])
  const [name, setName] = useState(''), [task, setTask] = useState(''), [message, setMessage] = useState('')
  const [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [maxModelRequests, setMaxModelRequests] = useState(128), [maxToolCalls, setMaxToolCalls] = useState(256)
  const [maxTurns, setMaxTurns] = useState(8), [minutes, setMinutes] = useState(30)
  const [maxTokens, setMaxTokens] = useState(1000000), [maxCostMicrousd, setMaxCostMicrousd] = useState('')
  const [messageKey, setMessageKey] = useState(() => crypto.randomUUID())
  const [spawnKey, setSpawnKey] = useState(() => crypto.randomUUID())
  const [actorId, setActorId] = useState('')
  const [role, setRole] = useState('worker')
  const [roles, setRoles] = useState<{ name: string; description: string; sandboxMode: string; maxTurns: number }[]>([])
  useEffect(() => {
    setActorId(''); setSpawnKey(crypto.randomUUID())
    let active = true
    const refresh = async () => {
      try { const result = await rpcRequest('agent.list', { sessionId }); if (active) setAgents(result) }
      catch (reason) { if (active) setError(String(reason)) }
    }
    void refresh()
    void rpcRequest('agent.roles', {}).then(result => { if (active) setRoles(result) }).catch(reason => { if (active) setError(String(reason)) })
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [sessionId, rpcRequest])
  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await work(); setAgents(await rpcRequest('agent.list', { sessionId })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const agent = agents.find(item => item.id === selected)
  return <div className="relative text-xs">
    <button onClick={() => setOpen(!open)} className="rounded border px-3 py-1.5">子任务 · {agents.length}</button>
    {open && <section className="absolute right-0 top-9 z-40 max-h-[70vh] w-[min(620px,85vw)] overflow-auto rounded-xl border border-stone-200 bg-white p-4 shadow-xl">
      <header className="flex justify-between"><b>子智能体任务</b><button onClick={() => setOpen(false)}>关闭</button></header>
      <LocalModelProfiles key={sessionId} />
      <MonChildModels key={sessionId} sessionId={sessionId} />
      <SubagentRoleEditor key={sessionId} role={role} onSaved={async () => { setRoles(await rpcRequest('agent.roles', {})); setSpawnKey(crypto.randomUUID()) }} />
      <SubagentParentActor key={sessionId} sessionId={sessionId} value={actorId} disabled={busy} onChange={value => { setActorId(value); setSpawnKey(crypto.randomUUID()) }} />
      <div className="mt-3 flex gap-2"><input aria-label="子任务名称" disabled={busy} value={name} onChange={event => { setName(event.target.value); setSpawnKey(crypto.randomUUID()) }} placeholder="task_name" className="min-w-0 flex-1 rounded border p-2" /></div>
      <textarea aria-label="子任务内容" disabled={busy} value={task} onChange={event => { setTask(event.target.value); setSpawnKey(crypto.randomUUID()) }} placeholder="明确目标、范围和完成标准" className="mt-2 w-full rounded border p-2" />
      <div className="mt-2 flex flex-wrap gap-3">
        <label>角色 <select disabled={busy || !roles.length} value={role} onChange={event => { setRole(event.target.value); setSpawnKey(crypto.randomUUID()) }} className="rounded border p-1">{roles.map(item => <option key={item.name} value={item.name}>{item.name} · {item.description}</option>)}</select></label>
        <label>最多任务轮数 <input type="number" min={1} max={32} disabled={busy} value={maxTurns} onChange={event => { setMaxTurns(Number(event.target.value)); setSpawnKey(crypto.randomUUID()) }} className="w-14 rounded border p-1" /></label>
        <label>模型次数 <input type="number" min={1} max={128} disabled={busy} value={maxModelRequests} onChange={event => { setMaxModelRequests(Number(event.target.value)); setSpawnKey(crypto.randomUUID()) }} className="w-16 rounded border p-1" /></label>
        <label>工具次数 <input type="number" min={1} max={256} disabled={busy} value={maxToolCalls} onChange={event => { setMaxToolCalls(Number(event.target.value)); setSpawnKey(crypto.randomUUID()) }} className="w-16 rounded border p-1" /></label>
        <label>截止分钟数 <input type="number" min={1} max={1440} disabled={busy} value={minutes} onChange={event => { setMinutes(Number(event.target.value)); setSpawnKey(crypto.randomUUID()) }} className="w-16 rounded border p-1" /></label>
        <label>Token 总量 <input type="number" min={1} max={100000000} disabled={busy} value={maxTokens} onChange={event => { setMaxTokens(Number(event.target.value)); setSpawnKey(crypto.randomUUID()) }} className="w-24 rounded border p-1" /></label>
        <label>估算费用上限（微美元，可留空）<input type="number" min={1} max={1000000000} disabled={busy} value={maxCostMicrousd} onChange={event => { setMaxCostMicrousd(event.target.value); setSpawnKey(crypto.randomUUID()) }} className="w-24 rounded border p-1" /></label>
      </div>
      <p className="mt-2">{roles.find(item => item.name === role)?.sandboxMode === 'read-only' ? '只读角色限制可用工具；子任务不能扩大父级策略。' : '工具仍需宿主审批，子任务权限独立。'} 响应后累计用量，达到上限后停止后续调用；已在途的响应可能超过上限。费用上限要求模型已配置单价。角色最多 {roles.find(item => item.name === role)?.maxTurns ?? '—'} 轮，按较小预算执行。</p>
      <button disabled={busy || !name || !task || !roles.some(item => item.name === role)} onClick={() => void run(async () => { const value = await rpcRequest('agent.spawn', { sessionId, ...(actorId ? { actorId } : {}), taskName: name, message: task, role, idempotencyKey: spawnKey, maxTurns, maxModelRequests, maxToolCalls, maxTokens, maxCostMicrousd: maxCostMicrousd === '' ? null : Number(maxCostMicrousd), timeoutMs: minutes * 60000 }); setSelected(value.id); setName(''); setTask(''); setSpawnKey(crypto.randomUUID()) })} className="mt-1 rounded border px-3 py-1 disabled:opacity-40">创建子任务</button>
      {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
      <div className="mt-3 space-y-2">{agents.map(item => <button key={item.id} onClick={() => setSelected(item.id)} className={`block w-full rounded border p-2 text-left ${selected === item.id ? 'border-amber-500' : 'border-stone-200'}`}><b>{item.agentPath}</b> · {item.status}</button>)}</div>
      {agent && <div className="mt-3 border-t pt-3">
        {agent.parentActorId && <p>父会话模型来源角色：{agent.parentActorId}</p>}
        <p className="break-all">任务工作区：{agent.workspaceRoot === null ? '尚待核对' : agent.workspaceRoot || '创建时未选择工作区'}</p>
        {!agent.workspaceRoot && !['queued', 'running'].includes(agent.status) && <SubagentWorkspaceRestore key={agent.id} agentId={agent.id} onSaved={async () => setAgents(await rpcRequest('agent.list', { sessionId }))} />}
        <SubagentRequestReview key={agent.id} agentId={agent.id} />
        {agent.recoveryState && <SubagentRecoveryPanel key={agent.id} agentId={agent.id} />}
        {agent.recoveryState && <InputOutcomeReview key={agent.childSessionId} sessionId={agent.childSessionId} />}
        {agent.recoveryState && <JobOutcomeReview key={agent.childSessionId} sessionId={agent.childSessionId} />}
        <SubagentJobResubmit key={agent.id} agentId={agent.id} sessionId={agent.childSessionId} onSaved={async () => setAgents(await rpcRequest('agent.list', { sessionId }))} />
        {agent.recoveryState && <SubagentMailboxRestore key={agent.sessionId} sessionId={agent.sessionId} />}
        {agent.recoveryState && (agent.usage.tokensUnknown || agent.usage.costUnknown) && <SubagentBaselineRestore key={agent.id} agentId={agent.id} onSaved={async () => setAgents(await rpcRequest('agent.list', { sessionId }))} />}
        {agent.recoveryState === 'context_prepared_policy_required' && <SubagentPolicyRestore key={agent.id} agentId={agent.id} onSaved={async () => setAgents(await rpcRequest('agent.list', { sessionId }))} />}
        {['policy_prepared_model_required', 'model_prepared_reopen_required'].includes(agent.recoveryState ?? '') && <SubagentModelRestore key={agent.id} agentId={agent.id} onSaved={async () => setAgents(await rpcRequest('agent.list', { sessionId }))} />}
        {agent.recoveryState === 'model_prepared_reopen_required' && <SubagentReopenRestore key={agent.id} agentId={agent.id} onSaved={async () => setAgents(await rpcRequest('agent.list', { sessionId }))} />}
        {agent.recoveryState && agent.recoveryState !== 'ready' && <SubagentDeadlineRestore key={`${agent.id}:${agent.deadlineAt}`} agentId={agent.id} deadline={agent.deadlineAt} onSaved={async () => setAgents(await rpcRequest('agent.list', { sessionId }))} />}
        <p className="mt-2">子树累计预算：模型 {agent.usage.modelRequests}/{agent.config.maxModelRequests} · 工具 {agent.usage.toolCalls}/{agent.config.maxToolCalls}</p>
        <p>Token：{agent.usage.tokensUnknown ? '用量待核对' : agent.usage.tokens}/{agent.config.maxTokens} · 估算费用：{agent.usage.costUnknown ? '单价或用量未知' : `${agent.usage.costMicrousd} 微美元`}{agent.config.maxCostMicrousd == null ? '（未设置费用上限）' : ` / ${agent.config.maxCostMicrousd} 微美元`}</p>
        {agent.recoveryState && agent.recoveryState !== 'ready' && <p>迁移前任务已保留，上下文、模型和策略尚待恢复；当前不能启动续接。</p>}
        {agent.deadlineAt != null && <p>截止时间：{new Date(Number(agent.deadlineAt)).toLocaleString()}</p>}
        {agent.error && <p className="text-red-700">{agent.error}</p>}
        {agent.result && <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words">{typeof agent.result === 'string' ? agent.result : JSON.stringify(agent.result, null, 2)}</pre>}
        <textarea aria-label="子任务消息" disabled={busy} value={message} onChange={event => { setMessage(event.target.value); setMessageKey(crypto.randomUUID()) }} maxLength={16000} placeholder="发送消息或续接任务" className="mt-2 w-full rounded border p-2" />
        <div className="mt-2 flex flex-wrap gap-3">
          <button disabled={busy || !message} onClick={() => void run(async () => { await rpcRequest('agent.send', { agentId: agent.id, message, idempotencyKey: messageKey }); setMessage(''); setMessageKey(crypto.randomUUID()) })}>仅发消息</button>
          <button disabled={busy || !message || Boolean(agent.recoveryState && agent.recoveryState !== 'ready') || ['queued', 'running'].includes(agent.status)} onClick={() => void run(async () => { await rpcRequest('agent.followup', { agentId: agent.id, message, idempotencyKey: messageKey }); setMessage(''); setMessageKey(crypto.randomUUID()) })}>启动续接</button>
          <button disabled={busy || !['queued', 'running'].includes(agent.status)} onClick={() => void run(() => rpcRequest('agent.interrupt', { agentId: agent.id }))} className="text-red-700">中断任务</button>
        </div>
      </div>}
    </section>}
  </div>
}
