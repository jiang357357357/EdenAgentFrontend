import { fileURLToPath } from "node:url"
import { createServer } from "vite"
import { WebSocket } from "ws"

/** Load the production browser transport against an explicitly provided test host. */
export async function browserRpcFixture({ baseUrl, capabilityToken, origin = "local", coreToken = "" }) {
  const previousWindow = globalThis.window
  const previousWebSocket = globalThis.WebSocket
  const events = new EventTarget()
  const storage = new Map([["agent.runtime_origin", origin], ["agent.auth_token", coreToken]])
  globalThis.WebSocket = WebSocket
  globalThis.window = {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    localStorage: { getItem: key => storage.get(key) ?? null },
    edenAgentDesktop: { getAgentCapability: async requestedOrigin => {
      if (requestedOrigin !== origin) throw new Error("Fixture world mismatch")
      return { token: capabilityToken, baseUrl }
    } },
  }
  let vite
  const subscriptions = new Set()
  try {
    vite = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, root: fileURLToPath(new URL("../../", import.meta.url)),
      configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" })
    const transport = await vite.ssrLoadModule("/src/lib/rpc-transport.ts")
    return {
      transport,
      async subscribe(onEvent, onStatus) {
        const dispose = await transport.subscribeRpcEvents(onEvent, onStatus)
        subscriptions.add(dispose)
        return () => { dispose(); subscriptions.delete(dispose) }
      },
      async close() {
        for (const dispose of subscriptions) dispose()
        subscriptions.clear()
        events.dispatchEvent(new Event("edenagent:account-changed"))
        await vite.close()
        globalThis.window = previousWindow
        globalThis.WebSocket = previousWebSocket
      },
    }
  } catch (error) {
    await vite?.close()
    globalThis.window = previousWindow
    globalThis.WebSocket = previousWebSocket
    throw error
  }
}
