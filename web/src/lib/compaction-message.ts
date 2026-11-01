import type { ApiMessage } from './agent-client'
import type { SessionEventInput } from './session-event'

/** A compaction has no assistant message event; give its durable result a stable card identity. */
export function compactionMessage(event: SessionEventInput): ApiMessage | undefined {
  const progress = compactionProgressMessage(event)
  if (progress) return progress
  if (event.eventType !== 'agent.session_compact') return undefined
  const payload = event.payload as Record<string, unknown>
  const entry = payload.compactionEntry as Record<string, unknown> | undefined
  if (!entry || typeof entry.summary !== 'string') return undefined
  const id = `compaction:${event.id}`
  const time = Number(event.createdAt)
  return {
    info: { id, role: 'assistant', modelID: '', providerID: '', ...(event.turnId ? { turnID: String(event.turnId) } : {}), time: { created: time, completed: time } },
    parts: [{ id: `${id}:summary`, messageID: id, sessionID: event.sessionId, type: 'compaction', auto: payload.automatic === true,
      summary: entry.summary, ...(typeof entry.firstKeptEntryId === 'string' ? { firstKeptEntryId: entry.firstKeptEntryId } : {}),
      ...(typeof entry.tokensBefore === 'number' ? { tokensBefore: entry.tokensBefore } : {}),
      ...(typeof payload.tokensAfter === 'number' ? { tokensAfter: payload.tokensAfter } : typeof entry.tokensAfter === 'number' ? { tokensAfter: entry.tokensAfter } : {}),
    }],
  }
}

function compactionProgressMessage(event: SessionEventInput): ApiMessage | undefined {
  if (!['agent.compaction_progress', 'agent.auto_compaction_failed'].includes(event.eventType)) return undefined
  const payload = event.payload as Record<string, unknown>
  const paused = event.eventType === 'agent.auto_compaction_failed'
  const processed = Number(payload.processed), total = Number(payload.total)
  if (!paused && (!Number.isSafeInteger(processed) || !Number.isSafeInteger(total) || processed < 0 || total < 1 || processed > total)) return undefined
  const id = `compaction-progress:${event.sessionId}:${event.turnId ?? 'manual'}`
  const summary = paused ? '历史整理已暂停，已完成的部分已保存，可重试继续。'
    : `已处理 ${processed}/${total} 段。${payload.resumed === true ? '已恢复上次进度。' : '进度会自动保存。'}`
  const completed = paused || processed === total
  return { info: { id, role: 'assistant', modelID: '', providerID: '', ...(event.turnId ? { turnID: String(event.turnId) } : {}),
      time: { created: Number(event.createdAt), ...(completed ? { completed: Number(event.createdAt) } : {}) } },
    parts: [{ id: `${id}:status`, messageID: id, sessionID: event.sessionId, type: 'compaction', auto: true, summary,
      progress: { paused, complete: completed } }] }
}

/** Display accepted /compact inputs without putting the command into model history. */
export function compactionCommandMessage(event: SessionEventInput): ApiMessage | undefined {
  const payload = event.payload as Record<string, unknown>
  if (event.eventType !== 'input.queued' || payload.kind !== 'compact') return undefined
  const id = `command:${event.id}`
  const instructions = typeof payload.text === 'string' ? payload.text : ''
  return {
    info: { id, role: 'user', ...(event.turnId ? { turnID: String(event.turnId) } : {}), time: { created: Number(event.createdAt) } },
    parts: [{ id: `${id}:text`, messageID: id, sessionID: event.sessionId, type: 'text', text: `/compact${instructions ? ` ${instructions}` : ''}` }],
  }
}
