import { useEffect, useState } from 'react'
import { rpcRequest } from '../../lib/rpc-transport'
import type { AgentThreadInfo } from '@eden/api'
export function SubagentPanel({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false), [agents, setAgents] = useState<AgentThreadInfo[]>([])
  const [name, setName] = useState(''), [task, setTask] = useState(''), [message, setMessage] = useState('')
  const [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [maxModelRequests, setMaxModelRequests] = useState(128), [maxToolCalls, setMaxToolCalls] = useState(256)
  const [maxTurns, setMaxTurns] = useState(8), [minutes, setMinutes] = useState(30)
  const [messageKey, setMessageKey] = useState(() => crypto.randomUUID())
  const [spawnKey, setSpawnKey] = useState(() => crypto.randomUUID())
  useEffect(() => {
    let active = true
    const refresh = async () => {
      try { const result = await rpcRequest('agent.list', { sessionId }); if (active) setAgents(result) }
      catch (reason) { if (active) setError(String(reason)) }
    }
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [sessionId])
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
      <div className="mt-3 flex gap-2"><input aria-label="子任务名称" disabled={busy} value={name} onChange={event => { setName(event.target.value); setSpawnKey(crypto.randomUUID()) }} placeholder="task_name" className="min-w-0 flex-1 rounded border p-2" /></div>
      <textarea aria-label="子任务内容" disabled={busy} value={task} onChange={event => { setTask(event.target.value); setSpawnKey(crypto.randomUUID()) }} placeholder="明确目标、范围和完成标准" className="mt-2 w-full rounded border p-2" />
      <div className="mt-2 flex flex-wrap gap-3">
        <label>最多任务轮数 <input type="number" min={1} max={32} disabled={busy} value={maxTurns} onChange={event => { setMaxTurns(Number(event.target.value)); setSpawnKey(crypto.randomUUID()) }} className="w-14 rounded border p-1" /></label>
        <label>模型次数 <input type="number" min={1} max={128} disabled={busy} value={maxModelRequests} onChange={event => { setMaxModelRequests(Number(event.target.value)); setSpawnKey(crypto.randomUUID()) }} className="w-16 rounded border p-1" /></label>
        <label>工具次数 <input type="number" min={1} max={256} disabled={busy} value={maxToolCalls} onChange={event => { setMaxToolCalls(Number(event.target.value)); setSpawnKey(crypto.randomUUID()) }} className="w-16 rounded border p-1" /></label>
        <label>截止分钟数 <input type="number" min={1} max={1440} disabled={busy} value={minutes} onChange={event => { setMinutes(Number(event.target.value)); setSpawnKey(crypto.randomUUID()) }} className="w-16 rounded border p-1" /></label>
      </div>
      <button disabled={busy || !name || !task} onClick={() => void run(async () => { const value = await rpcRequest('agent.spawn', { sessionId, taskName: name, message: task, role: 'worker', idempotencyKey: spawnKey, maxTurns, maxModelRequests, maxToolCalls, timeoutMs: minutes * 60000 }); setSelected(value.id); setName(''); setTask(''); setSpawnKey(crypto.randomUUID()) })} className="mt-1 rounded border px-3 py-1 disabled:opacity-40">创建子任务</button>
      {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
      <div className="mt-3 space-y-2">{agents.map(item => <button key={item.id} onClick={() => setSelected(item.id)} className={`block w-full rounded border p-2 text-left ${selected === item.id ? 'border-amber-500' : 'border-stone-200'}`}><b>{item.agentPath}</b> · {item.status}</button>)}</div>
      {agent && <div className="mt-3 border-t pt-3">
        <p className="mt-2">子树累计预算：模型 {agent.usage.modelRequests}/{agent.config.maxModelRequests} · 工具 {agent.usage.toolCalls}/{agent.config.maxToolCalls}</p>
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
