import { useState } from 'react'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
function previewInput(origin: 'mon' | 'local', sessionId: string, id: string) { return rpcRequestForOrigin(origin, 'input.resubmission.preview', { sessionId, id }) }
export function InputResubmission({ sessionId, id }: { sessionId: string; id: string }) {
  const [origin] = useState(() => getStoredRuntimeOrigin() ?? 'mon')
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof previewInput>> | null>(null), [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState('')
  async function load() {
    setBusy(true); setError(''); setPlan(null); setConfirmed(false)
    try { setPlan(await previewInput(origin, sessionId, id)) } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  async function submit() {
    if (!plan || !confirmed) return
    setBusy(true); setError('')
    try {
      const accepted = await rpcRequestForOrigin(origin, 'input.resubmission.apply', { sessionId, id, fingerprint: plan.fingerprint, note, confirmResubmit: true })
      setResult(`已受理新输入 ${accepted.inputId}，状态：${accepted.state}`); setConfirmed(false)
    } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <details className="mt-2 rounded border p-2"><summary>明确重新提交已停止的输入</summary>
    <button disabled={busy} onClick={() => void load()} className="my-2 rounded border px-2 py-1">预览原输入与附件</button>
    {plan && <><pre className="max-h-56 overflow-auto whitespace-pre-wrap">{JSON.stringify(plan, null, 2)}</pre>
      <p>使用当前会话角色及模型，恢复以上原环境并重新校验附件。新输入可能立即开始执行；迁移审阅模式仅可预览。</p>
      <textarea aria-label="重新提交原因" disabled={busy} value={note} onChange={event => { setNote(event.target.value); setConfirmed(false) }} placeholder="说明重新执行原因及原副作用的核对结果" className="mt-2 w-full rounded border p-2" />
      <label className="block"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 我明确要求按以上内容创建新的输入并执行。</label>
      <button disabled={busy || !confirmed || !note.trim() || Boolean(result)} onClick={() => void submit()} className="mt-2 rounded border px-2 py-1">确认重新提交</button></>}
    {result && <p role="status">{result}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
  </details>
}
