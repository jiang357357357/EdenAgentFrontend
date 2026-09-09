import { rpcMethods, type SchemaRpcMethodMap } from '@eden/api'
import type { EdenAgentRpcClient } from './rpc-client'
export type RpcMethodMap = SchemaRpcMethodMap
export async function requestWithContract<K extends keyof RpcMethodMap>(client: EdenAgentRpcClient, method: K,
  params: RpcMethodMap[K]['params']): Promise<RpcMethodMap[K]['result']> {
  if (!Object.hasOwn(rpcMethods, method)) throw new Error(`Unknown RPC contract: ${String(method)}`)
  const contract = rpcMethods[method]
  const input = contract.params.parse(params)
  const send = client.request as (method: string, params: unknown) => Promise<unknown>
  const result = await send.call(client, method, input)
  return contract.result.parse(result) as RpcMethodMap[K]['result']
}
