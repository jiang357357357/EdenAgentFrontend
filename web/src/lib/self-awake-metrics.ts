type Value = Record<string, unknown>
export interface SelfAwakeUsage {
  requests: number
  responses: number
  complete: boolean
  total: number | null
  recorded: number | null
  input: number | null
  output: number | null
  cacheRead: number | null
  cacheWrite: number | null
}
export interface SelfAwakeTiming {
  startedAt?: string
  finishedAt?: string | null
  status: string
}

function object(value: unknown): Value {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {}
}
function tokens(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function sum(values: unknown[]): number | null {
  if (!values.length || !values.every(tokens)) return null
  const total = values.reduce((n, value) => n + value, 0)
  return tokens(total) ? total : null
}
function responseTotal(usage: Value): number | null {
  return tokens(usage.totalTokens) ? usage.totalTokens : sum([usage.input, usage.output, usage.cacheRead, usage.cacheWrite])
}

/** The selected execution is the boundary: never borrow the background session's last request or cumulative usage. */
export function selfAwakeUsage(record: unknown, runId: string): SelfAwakeUsage {
  const value = object(record), matches = object(value.run).id === runId
  const events = matches && Array.isArray(value.events) ? value.events : []
  const requests = new Set<string>(), responses = new Map<string, Value>()
  for (const [index, item] of events.entries()) {
    const event = object(item), payload = object(event.payload)
    const requestId = typeof payload.requestId === 'string' && payload.requestId ? payload.requestId : undefined
    if (event.kind === 'model.request') requests.add(requestId ? `request:${requestId}` : `missing:${index}`)
    if (event.kind === 'model.response') responses.set(requestId ? `request:${requestId}` : `response:${event.id ?? index}`, object(payload.usage))
  }
  const usage = [...responses.values()], totals = usage.map(responseTotal)
  const recorded = sum(totals.filter(tokens))
  const complete = usage.length > 0 && totals.every(tokens) && [...requests].every(id => responses.has(id)) && sum(totals) !== null
  return { requests: requests.size, responses: usage.length, complete, total: complete ? sum(totals) : null, recorded,
    input: sum(usage.map(value => value.input)), output: sum(usage.map(value => value.output)),
    cacheRead: sum(usage.map(value => value.cacheRead)), cacheWrite: sum(usage.map(value => value.cacheWrite)) }
}

function timestamp(value: unknown): number | undefined {
  const at = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Date.parse(value) : NaN
  return Number.isFinite(at) && at >= 0 ? at : undefined
}

/** Persisted dispatch-to-completion time, including execution queueing, initialization and tools. */
export function selfAwakeElapsed(record: unknown, runId: string, fallback: SelfAwakeTiming, now: number) {
  const value = object(record), run = object(value.run), matched = run.id === runId
  const status = matched && typeof run.status === 'string' ? run.status : fallback.status
  const start = timestamp(matched ? run.startedAt : fallback.startedAt)
  const finish = timestamp(matched ? run.completedAt : fallback.finishedAt)
  const running = ['running', 'awaiting_action', 'action_running'].includes(status) && finish === undefined
  const end = finish ?? (running ? now : undefined)
  return { running, durationMs: start !== undefined && end !== undefined && end >= start ? end - start : undefined }
}

export function selfAwakeRecordMatches(record: unknown, runId: string): boolean {
  return object(object(record).run).id === runId
}
