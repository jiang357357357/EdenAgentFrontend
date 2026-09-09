import { rpcMethods, type SchemaRpcMethodMap } from '@eden/api'
import type { EdenAgentRpcClient, RpcMethodMap as LegacyRpcMethodMap } from '../generated/eden-agent-rpc'

// Override migrated types without mutating the legacy generated file or its augmentations.
export type RpcMethodMap = Omit<LegacyRpcMethodMap, keyof SchemaRpcMethodMap> & SchemaRpcMethodMap
export async function requestWithContract<K extends keyof RpcMethodMap>(client: EdenAgentRpcClient, method: K,
  params: RpcMethodMap[K]['params']): Promise<RpcMethodMap[K]['result']> {
  const contract = Object.hasOwn(rpcMethods, method) ? rpcMethods[method as keyof typeof rpcMethods] : undefined
  const input = contract ? contract.params.parse(params) : params
  // The generated transport still serializes JSON; schema types supersede old bigint declarations.
  const send = client.request as (method: string, params: unknown) => Promise<unknown>
  const result = await send.call(client, method, input)
  return (contract ? contract.result.parse(result) : result) as RpcMethodMap[K]['result']
}
