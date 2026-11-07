import { z } from 'zod'
import { jsonValue } from '@eden/api'

export const workerInvocationSchema = z.object({ type: z.literal('invoke'), id: z.string().uuid(),
  kind: z.enum(['command', 'tree', 'message']), target: z.string().max(256), args: z.array(jsonValue).max(32), sessionId: z.string().optional() }).strict()
export const extensionHostRequestSchema = z.object({ type: z.literal('host'), id: z.string().uuid(), invocation: z.string().uuid(),
  method: z.enum(['session.read', 'session.send', 'tool.call', 'extension.state', 'message', 'progress', 'openView', 'status', 'refreshTree', 'postMessage']),
  input: z.record(z.string(), jsonValue) }).strict()
export const extensionResponseSchema = z.object({ type: z.literal('result'), id: z.string().uuid(), result: jsonValue.optional(), error: z.string().max(4000).optional() }).strict()
export type ExtensionHostRequest = z.infer<typeof extensionHostRequestSchema>
export type WorkerInvocation = z.infer<typeof workerInvocationSchema>
