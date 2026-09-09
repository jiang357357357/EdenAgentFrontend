import { memoryCandidatesPageSchema } from '@eden/api'
import type { MemoryCandidatesResume } from '@eden/api'
import { rpcRequestForOrigin } from './rpc-transport'
import type { RuntimeOrigin } from './runtime-origin'

export async function listMemoryCandidates(origin: RuntimeOrigin, sessionId: string, after?: string) {
  return memoryCandidatesPageSchema.parse(await rpcRequestForOrigin(origin, 'memory.extraction.candidates', { sessionId, after, limit: 20 }))
}
export function resumeMemoryCandidates(origin: RuntimeOrigin, params: MemoryCandidatesResume) {
  return rpcRequestForOrigin(origin, 'memory.extraction.resume', params)
}
