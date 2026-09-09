import { useEffect, useState } from 'react'
import { rpcRequest } from '../../lib/rpc-transport'

interface RequestInfo { id: string; agentId: string; turnId: string; createdAt: number; executing: boolean; costConfigured: boolean; tokens: number | null; costMicrousd: number | null }
export function SubagentRequestReview({ agentId }: { agentId: string }) {
  const [items, setItems] = useState<RequestInfo[]>([]), [cursor, setCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState(''), [tokens, setTokens] = useState(''), [cost, setCost] = useState(''), [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let live = true
    void rpcRequest('agent.requests.list', { agentId }).then(result => { if (live) { setItems(result.items); setCursor(result.nextCursor) } })
      .catch(reason => { if (live) setError(String(reason)) })
    return () => { live = false }
  }, [agentId])
  async function refresh(after?: string) {
    setBusy(true); setError('')
    try {
      const result = await rpcRequest('agent.requests.list', { agentId, ...(after ? { after } : {}) })
      setItems(previous => after ? [...previous, ...result.items] : result.items); setCursor(result.nextCursor)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function resolve() {
    setBusy(true); setError('')
    try {
      await rpcRequest('agent.requests.review', { agentId, requestId: selected, tokens: Number(tokens), costMicrousd: Number(cost), note, confirmUsage: true })
      setItems(previous => previous.filter(item => item.id !== selected)); setSelected(''); setTokens(''); setCost(''); setNote(''); setConfirmed(false)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  const request = items.find(item => item.id === selected)
  const valid = tokens !== '' && cost !== '' && Number.isSafeInteger(Number(tokens)) && Number(tokens) >= 0 && Number(tokens) <= 100000000 &&
    Number.isSafeInteger(Number(cost)) && Number(cost) >= 0 && Number(cost) <= 1000000000
  return <details className="mt-3 rounded border p-2">
    <summary>模型请求用量核对 · {items.length}{cursor ? '+' : ''}</summary>
    <p className="mt-2">这里列出尚未取得完整用量回执的请求。在原执行结束后，根据供应商记录填写实际用量与证据；不能因为没有回复就填零。确认不会重发请求。</p>
    <button disabled={busy} onClick={() => void refresh()} className="mt-2 rounded border px-2 py-1">刷新</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {items.map(item => <button key={item.id} disabled={busy} onClick={() => { setSelected(item.id); setTokens(item.tokens == null ? '' : String(item.tokens)); setCost(item.costMicrousd == null ? '' : String(item.costMicrousd)); setNote(''); setConfirmed(false) }} className={`mt-2 block w-full rounded border p-2 text-left ${selected === item.id ? 'border-amber-500' : ''}`}>
      {new Date(item.createdAt).toLocaleString()} · {item.executing ? '原执行尚未结束' : '用量待核对'}<br />{item.id}
    </button>)}
    {cursor && <button disabled={busy} onClick={() => void refresh(cursor)}>加载更多</button>}
    {request && <div className="mt-2 space-y-2">
      <label className="block">实际 Token <input type="number" min={0} max={100000000} disabled={busy || request.executing || request.tokens !== null} value={tokens} onChange={event => { setTokens(event.target.value); setConfirmed(false) }} className="rounded border p-1" /></label>
      <label className="block">费用（微美元）<input type="number" min={0} max={1000000000} disabled={busy || request.executing || request.costMicrousd !== null} value={cost} onChange={event => { setCost(event.target.value); setConfirmed(false) }} className="rounded border p-1" /></label>
      <textarea aria-label="用量核对证据" placeholder="填写记录来源和核对说明" maxLength={4000} disabled={busy || request.executing} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} className="w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy || request.executing} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我已核对记录，确认将此用量累计到子任务及其祖先。</label>
      <button disabled={busy || request.executing || !confirmed || !valid || !note.trim()} onClick={() => void resolve()} className="rounded border px-2 py-1 disabled:opacity-40">记录核对结果</button>
    </div>}
  </details>
}
