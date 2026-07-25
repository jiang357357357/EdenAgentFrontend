import type { SubagentThread } from "../types"

export function upsertSubagentThread(
  current: SubagentThread[] | undefined,
  agent: SubagentThread,
): SubagentThread[] {
  const threads = [...(current ?? [])]
  const index = threads.findIndex((item) => item.id === agent.id)
  if (index === -1) threads.push(agent)
  else threads[index] = { ...threads[index], ...agent }
  return threads.sort((left, right) => left.createdAt - right.createdAt)
}
