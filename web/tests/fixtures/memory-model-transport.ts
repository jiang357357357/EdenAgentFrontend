export function rpcRequestForOrigin(origin: string, method: string, params: unknown) {
  return (window as unknown as { modelFixtureRequest: (origin: string, method: string, params: unknown) => Promise<unknown> }).modelFixtureRequest(origin, method, params)
}
