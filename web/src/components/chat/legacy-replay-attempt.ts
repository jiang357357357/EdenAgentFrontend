export interface ReplayAttempt { requestKey: string; note: string }
const storageKey = (sessionId: string, id: number) => `eden:mon:legacy-replay:${sessionId}:${id}`
export function readReplayAttempt(sessionId: string, id: number): { attempt: ReplayAttempt | null; error: string } {
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId, id))
    if (!raw) return { attempt: null, error: '' }
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('requestKey' in value) || !('note' in value)
      || typeof value.requestKey !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.requestKey)
      || typeof value.note !== 'string' || !value.note.trim() || value.note.length > 2000) throw new Error('Invalid saved replay intent')
    return { attempt: { requestKey: value.requestKey, note: value.note }, error: '' }
  } catch {
    return { attempt: null, error: '无法读取本页保存的投递编号。请先在历史记录中核实投递结果，再恢复操作。' }
  }
}
export function saveReplayAttempt(sessionId: string, id: number, attempt: ReplayAttempt | null): void {
  const key = storageKey(sessionId, id)
  if (attempt) sessionStorage.setItem(key, JSON.stringify(attempt))
  else sessionStorage.removeItem(key)
}
