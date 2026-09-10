import { useEffect, useRef, useState } from 'react'
import type { MonSyncResult } from '@eden/api'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
import { readReplayAttempt, saveReplayAttempt, type ReplayAttempt } from './legacy-replay-attempt'

type Item = MonSyncResult['legacy']['items'][number]
export function LegacySyncReplay({ sessionId, item, onUpdated }: { sessionId: string; item: Item; onUpdated: () => void }) {
  const [saved] = useState(() => readReplayAttempt(sessionId, item.id))
  const [attempt, setAttempt] = useState<ReplayAttempt | null>(saved.attempt)
  const [note, setNote] = useState(saved.attempt?.note ?? ''), [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState(saved.error), [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ state: 'running' | 'unknown' | 'completed'; error: string | null } | null>(null)
  const mounted = useRef(true), locked = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const matching = item.replay?.requestKey === attempt?.requestKey ? item.replay : null
  const outcome = matching ?? result
  const available = ['held', 'unknown'].includes(item.state) && item.review === null
  const submit = async () => {
    if (locked.current || saved.error || getStoredRuntimeOrigin() !== 'mon') return
    if (!attempt && (!available || !confirmed || !note.trim())) return
    locked.current = true; setBusy(true); setError('')
    try {
      const next = attempt ?? { requestKey: crypto.randomUUID(), note: note.trim() }
      // Persist before sending: an interrupted response must retain the same request identity.
      saveReplayAttempt(sessionId, item.id, next)
      setAttempt(next)
      const receipt = await rpcRequestForOrigin('mon', 'mon.sync.legacy.replay', { sessionId, id: item.id, ...next, confirm: true })
      if (mounted.current && getStoredRuntimeOrigin() === 'mon') { setResult({ ...receipt, error: receipt.error ?? null }); onUpdated() }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  const prepareAnother = () => {
    if (locked.current || !available || outcome?.state !== 'unknown' || getStoredRuntimeOrigin() !== 'mon') return
    try {
      saveReplayAttempt(sessionId, item.id, null)
      setAttempt(null); setResult(null); setConfirmed(false); setError('')
    } catch { setError('无法保存新的操作状态，请保留原投递编号并稍后重试。') }
  }
  if (!available && !attempt) return null
  return <div className="space-y-2 border-l pl-2">
    <p>重新投递会把历史会话及对应消息或导演记录写入原 Core，可能更新远端已有内容。请先核实原账号和远端记录。</p>
    <label className="block">重新投递说明
      <textarea aria-label={`历史投递 ${item.id} 的重新投递说明`} value={note} disabled={busy || attempt !== null}
        maxLength={2000} onChange={event => setNote(event.target.value)} className="block w-full rounded border bg-transparent p-1" />
    </label>
    {!attempt && <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy}
      onChange={event => setConfirmed(event.target.checked)} />我已核实这条记录，确认向原 Core 再次投递</label>}
    <button type="button" disabled={busy || Boolean(saved.error) || (!attempt && (!available || !confirmed || !note.trim()))}
      onClick={() => void submit()}>{attempt ? '查询原投递结果 / 继续原请求' : '确认重新投递'}</button>
    {attempt && <p>本次编号：{attempt.requestKey}。连接中断后继续使用此编号，不会另建一次投递。</p>}
    {outcome && <p role="status">{outcome.state === 'completed' ? '这次投递已确认完成。' : outcome.state === 'running' ? '这次投递正在处理中。' : '这次投递结果未确认，请先核对 Core。'}{outcome.error}</p>}
    {attempt && available && outcome?.state === 'unknown' && <button type="button" disabled={busy} onClick={prepareAnother}>核对后准备一次新的投递</button>}
    {busy && <p role="status">正在处理，请保留此页面…</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
