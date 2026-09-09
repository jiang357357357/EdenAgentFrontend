import type { SessionEvent } from '@eden/api'

/** Old generated notifications remain accepted until the client is regenerated. */
export type SessionEventInput = Omit<SessionEvent, 'seq' | 'createdAt' | 'turnId'> & {
  seq: string | bigint
  createdAt: number | bigint
  turnId?: string | null
}
