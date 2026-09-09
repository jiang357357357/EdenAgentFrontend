import { useCallback, useState } from 'react'
import type { RpcMethodMap } from './rpc-contracts'
import { rpcRequestForOrigin } from './rpc-transport'
import { getStoredRuntimeOrigin, getRuntimeOriginRevision } from './runtime-origin'

/** Capture form ownership once. The transport rejects requests and responses after a world change. */
export function useScopedRpc() {
  const [{ origin, revision }] = useState(() => ({ origin: getStoredRuntimeOrigin() ?? 'mon', revision: getRuntimeOriginRevision() }))
  return useCallback(<K extends keyof RpcMethodMap>(method: K, params: RpcMethodMap[K]['params']) =>
    rpcRequestForOrigin(origin, method, params, revision), [origin, revision])
}
