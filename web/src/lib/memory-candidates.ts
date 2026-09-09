import { memoryCandidatesPageSchema } from '@eden/api'
import type { MemoryCandidatesPage, MemoryCandidatesList, MemoryCandidatesResume } from '@eden/api'
import { rpcRequestForOrigin } from './rpc-transport'
import type { RuntimeOrigin } from './runtime-origin'

// Transitional augmentation: new TS contracts extend the legacy generated transport without editing its output.
declare module '../generated/eden-agent-rpc' {
  interface RpcMethodMap {
    'memory.extraction.candidates': { params: MemoryCandidatesList; result: MemoryCandidatesPage }
    'memory.extraction.resume': { params: MemoryCandidatesResume; result: { jobId: string; state: 'accepted' } }
  }
}

export async function listMemoryCandidates(origin: RuntimeOrigin, sessionId: string, after?: string) {
  return memoryCandidatesPageSchema.parse(await rpcRequestForOrigin(origin, 'memory.extraction.candidates', { sessionId, after, limit: 20 }))
}
export function resumeMemoryCandidates(origin: RuntimeOrigin, params: MemoryCandidatesResume) {
  return rpcRequestForOrigin(origin, 'memory.extraction.resume', params)
}
