export * from '../../src/lib/rpc-transport'

export function rpcRequestForOrigin(origin: string, method: string, params: unknown, revision?: number) {
  return (window as unknown as { promptModeFixtureRequest: (origin: string, method: string, params: unknown, revision?: number) => Promise<unknown> })
    .promptModeFixtureRequest(origin, method, params, revision)
}
