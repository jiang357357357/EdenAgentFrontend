import { LegacySyncReplay } from './LegacySyncReplay'
import { LegacySyncReview } from './LegacySyncReview'
import type { MonSyncResult as SyncStatus } from '@eden/api'
import { useEffect, useState } from 'react'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
const labels: Record<string, string> = { pending: '待投递', running: '投递中', applied: '已确认', unknown: '结果未确认', failed: '失败', held: '等待恢复', completed: '历史投递完成', abandoned: '已放弃旧投递' }
export function MonSyncPanel({ sessionId }: { sessionId: string }) {
  const origin = getStoredRuntimeOrigin()
  return origin === 'mon' ? <MonSyncSessionPanel key={sessionId} sessionId={sessionId} /> : null
}
function MonSyncSessionPanel({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false), [status, setStatus] = useState<SyncStatus | null>(null)
  const [error, setError] = useState(''), [before, setBefore] = useState<number | undefined>()
  const [revision, setRevision] = useState(0)
  const [legacyBefore, setLegacyBefore] = useState<number | undefined>()
  useEffect(() => { setStatus(null); setError(''); setBefore(undefined); setLegacyBefore(undefined) }, [sessionId])
  const origin = getStoredRuntimeOrigin()
  useEffect(() => {
    if (!open || origin !== 'mon') return
    let active = true, pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const result = await rpcRequestForOrigin('mon', 'mon.sync.status', { sessionId, ...(before === undefined ? {} : { before }), limit: 30, ...(legacyBefore === undefined ? {} : { legacyBefore }) })
        if (active) { setStatus(result); setError('') }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : String(reason)) }
      finally { pending = false }
    }
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [sessionId, open, before, legacyBefore, origin, revision])
  if (origin !== 'mon') return null
  return <section className="rounded-lg border p-3 text-sm">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>Mon 同步记录</button>
    {open && <div className="mt-2 space-y-2">
      {error && <p role="alert">{error}</p>}
      {status && <>
        <p>{status.bound ? '已绑定 Core' : '尚未绑定 Core，请先刷新会话模型目录'}</p>
        <p>{Object.entries(status.totals).map(([state, count]) => `${labels[state] ?? state}：${count}`).join(' · ') || '暂无投递记录'}</p>
        {(status.legacy.identityState || status.legacy.items.length > 0) && <div className="border-t pt-2">
          <p>迁移前同步记录 · {status.legacy.identityState === 'rebound' ? '原账号已核对' : status.legacy.identityState ? '原账号待核对：请刷新会话模型目录' : '无历史身份记录'}</p>
          {status.legacy.blocked && <p>历史身份或未决投递尚未处理，自动同步暂停。</p>}
          <p>{Object.entries(status.legacy.totals).map(([state, count]) => `${labels[state] ?? state}：${count}`).join(' · ')}</p>
          <ul>{status.legacy.items.map(item => <li key={item.id} className="py-1">#{item.id} · {item.kind} · {labels[item.state] ?? item.state} · 尝试 {item.attempts} 次
            {item.error && <p>{item.error}</p>}
            {item.replay && <p>最近重投：{labels[item.replay.state] ?? item.replay.state} · {item.replay.note}{item.replay.error ? ` · ${item.replay.error}` : ''}</p>}
            {status.legacy.identityState === 'rebound' && ['session', 'message', 'director'].includes(item.kind) && <LegacySyncReplay
              sessionId={sessionId} item={item} onUpdated={() => setRevision(value => value + 1)} />}
            {item.review && <p>人工记录：{item.review.decision === 'confirm_completed' ? '已核实完成' : '放弃'} · {item.review.note}</p>}
            {['held', 'unknown'].includes(item.state) && <LegacySyncReview sessionId={sessionId} id={item.id}
              onResolved={() => { setStatus(null); setRevision(value => value + 1) }} />}
          </li>)}</ul>
          {legacyBefore !== undefined && <button type="button" onClick={() => { setStatus(null); setLegacyBefore(undefined) }}>最新历史记录</button>}
          {status.legacy.nextCursor !== null && <button type="button" onClick={() => { setLegacyBefore(status.legacy.nextCursor!); setStatus(null) }}>更早历史记录</button>}
        </div>}
        {status.contacts.map(item => <p key={item.requestId}>{item.channel === 'qq' ? 'QQ 通知' : '邮件通知'} · {item.state === 'accepted' ? '渠道已接受' : labels[item.state] ?? item.state}{item.error ? ` · ${item.error}` : ''}</p>)}
        {status.progress.filter(item => item.error).map((item, index) => <p key={index}>同步暂未确认，已失败 {item.attempts} 次；下次重试：{new Date(item.retryAt).toLocaleTimeString()}。</p>)}
        <p>“已确认”表示该项 Core 投递已返回成功，不代表整个会话已经同步完毕。</p>
        <ul>{status.items.map(item => <li key={item.id} className="border-t py-2">
          {item.kind} · {labels[item.state] ?? item.state} · {new Date(item.updatedAt).toLocaleString()}
          {item.error && <p>{item.error}</p>}
        </li>)}</ul>
        {before !== undefined && <button type="button" onClick={() => { setStatus(null); setBefore(undefined) }}>最新记录</button>}
        {status.nextCursor !== null && <button type="button" onClick={() => { setBefore(status.nextCursor!); setStatus(null) }}>更早记录</button>}
      </>}
    </div>}
  </section>
}
