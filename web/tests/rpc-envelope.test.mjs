import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { EdenAgentRpcClient } = await vite.ssrLoadModule('/src/lib/rpc-client.ts')
const original = globalThis.WebSocket
let reply = { result: { pong: true }, error: null }
class Socket extends EventTarget {
  static OPEN = 1
  readyState = 1
  constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))) }
  send(raw) {
    const request = JSON.parse(raw)
    const body = request.method === 'initialize' ? { result: { protocolVersion: 2, serverName: 'fixture', serverVersion: '2',
      agentCoreVersion: 'pi', runtimeOrigin: 'local', capabilities: [] }, error: null } : reply
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ jsonrpc: '2.0', id: request.id, ...body }) })))
  }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')) }
}
globalThis.WebSocket = Socket
after(async () => { globalThis.WebSocket = original; await vite.close() })

test('browser RPC accepts legacy null placeholders but rejects contradictory result/error envelopes', async () => {
  const client = new EdenAgentRpcClient()
  try {
    await client.connect('ws://127.0.0.1:1/rpc', 'x'.repeat(43), 'test', 'local')
    assert.deepEqual(await client.request('ping', {}), { pong: true })
    reply = { result: null }
    assert.equal(await client.request('ping', {}), null)
    reply = { result: null, error: { code: -32602, message: 'invalid parameters' } }
    await assert.rejects(client.request('ping', {}), /invalid parameters/)
    reply = { result: { pong: true }, error: { code: -32603, message: 'contradictory' } }
    await assert.rejects(client.request('ping', {}), /Invalid RPC response/)
    reply = { error: null }
    await assert.rejects(client.request('ping', {}), /Invalid RPC response/)
  } finally { client.close() }
})
