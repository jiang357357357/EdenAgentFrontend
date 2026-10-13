export function rpcRequestForOrigin(origin: string, method: string, params: unknown) {
  return (window as unknown as { terminalFixtureRequest: (origin: string, method: string, params: unknown) => Promise<unknown> }).terminalFixtureRequest(origin, method, params)
}
