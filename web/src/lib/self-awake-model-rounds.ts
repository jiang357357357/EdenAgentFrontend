import { selfAwakeToolExecutions, type SelfAwakeToolExecution } from './self-awake-context.ts'
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export type SelfAwakeModelRound = { id: string; model: string; responded: boolean; tools: SelfAwakeToolExecution[] }
export function selfAwakeModelRounds(value: unknown) {
  const events = object(value).events
  const calls = new Map(selfAwakeToolExecutions(value).map(call => [call.id, call]))
  const rounds: SelfAwakeModelRound[] = [], unassigned: SelfAwakeToolExecution[] = []
  let current: SelfAwakeModelRound | undefined
  for (const entry of Array.isArray(events) ? events : []) {
    const event = object(entry), payload = object(event.payload)
    if (event.kind === 'model.request') {
      current = { id: String(payload.requestId), model: String(payload.model ?? ''), responded: false, tools: [] }
      rounds.push(current)
    } else if (event.kind === 'model.response') {
      const round = rounds.find(item => item.id === payload.requestId)
      if (round) { round.responded = true; current = round }
    } else if (event.kind === 'agent.tool_execution_start') {
      const call = calls.get(String(payload.toolCallId))
      if (call) { if (current?.responded) current.tools.push(call); else unassigned.push(call) }
    }
  }
  return { rounds, unassigned }
}
