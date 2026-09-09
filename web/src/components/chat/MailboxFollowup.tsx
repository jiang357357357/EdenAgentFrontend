import { useState } from 'react'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
export function MailboxFollowup({ sessionId, id, fingerprint }: { sessionId: string; id: string; fingerprint: string }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [preview, setPreview] = useState<{ agentId: string; message: string } | null>(null)
  const [note, setNote] = useState(''), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState('')
  const [abandonNote, setAbandonNote] = useState(''), [confirmAbandon, setConfirmAbandon] = useState(false)
  async function load() {
    setBusy(true); setError(''); setConfirm(false)
    try { setPreview(await rpcRequestForOrigin(origin, 'agent.recovery.mailbox.followup.preview', { sessionId, id, fingerprint })) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function apply() {
    if (!confirm) return
    setBusy(true); setError('')
    try { const thread = await rpcRequestForOrigin(origin, 'agent.recovery.mailbox.followup.apply', { sessionId, id, fingerprint, note, confirmExecution: true }); setResult(`已受理：${thread.id}`); setConfirm(false) }
    catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function abandon() {
    if (!confirmAbandon) return
    setBusy(true); setError('')
    try {
      await rpcRequestForOrigin(origin, 'agent.recovery.mailbox.followup.abandon', { sessionId, id, fingerprint, note: abandonNote, confirmAbandon: true })
      setResult('已放弃续接，原始内容和准备记录已保留。'); setConfirm(false); setConfirmAbandon(false)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <div className="mt-2 rounded border p-2"><p>任务恢复并重开后，可明确执行这条历史续接。迁移审阅模式允许查看或放弃，执行须进入正式运行模式。</p>
    <button disabled={busy} onClick={() => void load()}>查看完整续接内容</button>
    {preview && <><p>目标：{preview.agentId}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{preview.message}</pre>
      <textarea value={note} aria-label="执行历史续接的依据" disabled={busy} onChange={event => { setNote(event.target.value); setConfirm(false) }} className="w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirm} onChange={event => setConfirm(event.target.checked)} /> 明确开始这一轮任务，使用当前预算与权限。</label>
      <button disabled={busy || !confirm || !note.trim() || Boolean(result)} onClick={() => void apply()}>执行历史续接</button></>}
    {!result && <details><summary>放弃这条续接</summary>
      <textarea aria-label="放弃历史续接的依据" value={abandonNote} disabled={busy} maxLength={4000} onChange={event => { setAbandonNote(event.target.value); setConfirmAbandon(false) }} />
      <label className="block"><input type="checkbox" checked={confirmAbandon} disabled={busy} onChange={event => setConfirmAbandon(event.target.checked)} /> 确认归档这条准备中的续接，不再执行。</label>
      <button disabled={busy || !confirmAbandon || !abandonNote.trim()} onClick={() => void abandon()}>确认放弃续接</button>
    </details>}
    {result && <p role="status">{result}</p>}{error && <p role="alert">{error}</p>}
  </div>
}
