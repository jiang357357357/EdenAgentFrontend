export async function rpcRequestForOrigin(_origin: string, method: string) {
  if (method === "session.list") return [...window.sessionMenuStore.values()]
  if (method === "message.list") return { items: [], hasMore: false, nextCursor: null }
  throw new Error(`Unexpected fixture RPC: ${method}`)
}
