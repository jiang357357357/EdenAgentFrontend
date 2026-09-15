import type { ApiMessage } from './agent-client'
import type { SessionEventInput } from './session-event'

/** A compaction has no assistant message event; give its durable result a stable card identity. */
export function compactionMessage(event: SessionEventInput): ApiMessage | undefined {
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
