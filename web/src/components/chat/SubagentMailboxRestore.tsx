import { useState } from 'react'
import { MailboxFollowup } from './MailboxFollowup'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
interface Item { id: string; state: string; senderPath: string; targetPath: string; kind: string; triggerTurn: boolean; content: string; truncated: boolean; fingerprint: string; canDeliver: boolean }
export function SubagentMailboxRestore({ sessionId }: { sessionId: string }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [items, setItems] = useState<Item[]>([]), [cursor, setCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState(''), [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [decision, setDecision] = useState<'archive' | 'deliver_message' | 'prepare_followup'>('archive')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function load(after?: string) {
    setBusy(true); setError(''); setConfirmed(false); setSelected('')
    try { const result = await rpcRequestForOrigin(origin, 'agent.recovery.mailbox.list', { sessionId, ...(after ? { after } : {}) }); setItems(result.items); setCursor(result.nextCursor) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  const item = items.find(value => value.id === selected)
  async function resolve() {
    if (!item || !confirmed) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin(origin, 'agent.recovery.mailbox.resolve', { sessionId, id: item.id, fingerprint: item.fingerprint, decision, note, confirmDecision: true })
      setItems(current => current.filter(value => value.id !== item.id)); setSelected(''); setConfirmed(false); setNote('')
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>恢复历史子任务信箱</summary>
    <p>普通消息及完成通知可在核对归属后供子任务或根会话读取。完成通知描述当时的结果，不改写当前任务状态；续接消息及无法明确映射的项不会自动触发执行。</p>
    <button disabled={busy} onClick={() => void load()} className="my-2 rounded border px-2 py-1">刷新待处理消息</button>
    {items.map(value => <button key={value.id} disabled={busy} onClick={() => { setSelected(value.id); setDecision('archive'); setConfirmed(false); setNote('') }} className="block w-full rounded border p-1 text-left">{value.senderPath} → {value.targetPath} · {value.kind}</button>)}
    {cursor && <button disabled={busy} onClick={() => void load(cursor)} className="my-2 rounded border px-2 py-1">下一页</button>}
    {item?.state === 'followup_prepared' && <MailboxFollowup key={item.id} sessionId={sessionId} id={item.id} fingerprint={item.fingerprint} />}
    {item && item.state !== 'followup_prepared' && <div className="mt-2"><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{item.content}</pre>
      {item.truncated && <p>这里只展示前 16000 字符；完整原文保留在历史记录中。</p>}
      <p>原触发标记：{item.triggerTurn ? '请求触发任务' : '不触发任务'}。本次恢复不会自动触发。</p>
      <select disabled={busy} value={decision} onChange={event => { setDecision(event.target.value as typeof decision); setConfirmed(false) }} className="rounded border p-1"><option value="archive">保留原文并归档</option>{item.canDeliver && <option value="deliver_message">确认归属并允许读取消息</option>}{item.kind === 'followup' && item.senderPath === '/root' && <option value="prepare_followup">保留为待明确执行的续接</option>}</select>
      <textarea aria-label="历史信箱处理依据" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="说明归属核对或归档原因" className="mt-2 w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我确认以上处理决定。</label>
      <button disabled={busy || !confirmed || !note.trim()} onClick={() => void resolve()} className="mt-2 rounded border px-2 py-1">保存信箱处理</button></div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
