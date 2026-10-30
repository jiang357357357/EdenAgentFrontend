const settings = new Map<string, { contextWindow: number | null; revision: string | null }>()
let revision = 0
export const fixture = { failSave: false, failRead: false, reads: 0, writes: 0 }
function info(sessionId: string) {
  const setting = settings.get(sessionId)
  const contextWindow = setting?.contextWindow ?? 262144
  return { contextWindow, defaultContextWindow: 262144, minContextWindow: 8192, maxOutputTokens: 4096,
    inputBudget: contextWindow - 4096 - Math.ceil(contextWindow * 0.05), override: setting?.contextWindow ?? null,
    revision: setting?.revision ?? null, modelKey: 'a'.repeat(64) }
}
async function rpc(method: string, params: Record<string, unknown>) {
  await new Promise(resolve => setTimeout(resolve, 15))
  if (method === 'model.context.read') {
    fixture.reads++
    if (fixture.failRead) throw new Error('读取设置失败，请重试。')
    return info(String(params.sessionId))
  }
  if (method === 'model.context.set') {
    fixture.writes++
    if (fixture.failSave) throw new Error('保存设置失败，请重试。')
    const current = info(String(params.sessionId))
    if (params.expectedRevision !== current.revision) throw new Error('设置已变化，请重新读取。')
    settings.set(String(params.sessionId), { contextWindow: params.contextWindow as number | null, revision: `revision-${++revision}` })
    return info(String(params.sessionId))
  }
  if (method === 'session.context') return { requests: [{ id: 'snapshot', createdAt: Date.now(),
    payload: { model: 'fixture', payload: { messages: [{ role: 'user', content: '保留实际上下文查看能力' }] } } }] }
  throw new Error(`Unexpected RPC ${method}`)
}
export function useScopedRpc() { return rpc }
