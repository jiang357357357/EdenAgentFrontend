import { marketKeyInfoSchema } from '@eden/api'
import type { MarketKeyInfo } from '@eden/api'
import { rpcRequest } from './rpc-transport'

export async function listMarketKeys() { return marketKeyInfoSchema.array().parse(await rpcRequest('plugin.market.key.list', {})) }
export async function addMarketKey(id: string, publicKey: string) { return marketKeyInfoSchema.parse(await rpcRequest('plugin.market.key.add', { id, publicKey })) }
export function revokeMarketKey(id: string) { return rpcRequest('plugin.market.key.revoke', { id }) }
