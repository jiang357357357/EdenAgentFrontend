import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const originalWindow = globalThis.window
const originalWebSocket = globalThis.WebSocket
let origin = 'mon'
let page = { items: [], nextCursor: null }
let beforeReply = () => {}
const sockets = []
class FakeWebSocket extends EventTarget {
  static OPEN = 1
  readyState = 1
  requests = []
  constructor() { super(); sockets.push(this); queueMicrotask(() => this.dispatchEvent(new Event('open'))) }
  send(raw) {
    const request = JSON.parse(raw)
    this.requests.push(request)
    const result = request.method === 'initialize' ? { protocolVersion: 2, serverName: 'fixture', serverVersion: '2', agentCoreVersion: 'pi-test', capabilities: [], runtimeOrigin: request.params.runtimeOrigin } :
      request.method === 'memory.extraction.resume' ? { jobId: request.params.jobId, state: 'accepted' } : page
    queueMicrotask(() => {
      if (request.method !== 'initialize') beforeReply()
      this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) }))
    })
  }
  close() { if (this.readyState !== 3) { this.readyState = 3; this.dispatchEvent(new Event('close')) } }
}
globalThis.WebSocket = FakeWebSocket
const windowEvents = new EventTarget()
globalThis.window = { addEventListener: windowEvents.addEventListener.bind(windowEvents), removeEventListener: windowEvents.removeEventListener.bind(windowEvents), dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents), localStorage: { getItem: () => origin }, edenAgentDesktop: { getAgentCapability: async () => ({ token: 'test-token' }) } }
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const api = await vite.ssrLoadModule('/src/lib/memory-candidates.ts')
afterEach(() => { sockets.splice(0).forEach(socket => socket.close()); origin = 'mon'; beforeReply = () => {} })
after(async () => { await vite.close(); globalThis.window = originalWindow; globalThis.WebSocket = originalWebSocket })
const id = '11111111-1111-4111-8111-111111111111'

test('candidate client sends session pagination and resumes the reviewed revision through the generated client', async () => {
  page = { items: [{ id, sessionId: id, turnId: id, actorId: '1', scopeKey: '11', candidates: [
    { kind: 'fact', content: 'A fact', confidence: 0.9 },
  ], revision: 'a'.repeat(64), processing: false, createdAt: 1, updatedAt: 1 }], nextCursor: '12' }
  const result = await api.listMemoryCandidates('mon', id, '2')
  assert.deepEqual(result, page)
  await api.resumeMemoryCandidates('mon', { sessionId: id, jobId: id, revision: result.items[0].revision })
  const requests = sockets[0].requests
  assert.deepEqual(requests[1].params, { sessionId: id, after: '2', limit: 20 })
  assert.deepEqual(requests[2].params, { sessionId: id, jobId: id, revision: 'a'.repeat(64) })
})

test('candidate client rejects malformed response instead of rendering unvalidated entries', async () => {
  page = { items: [{ id: 'invalid' }], nextCursor: null }
  await assert.rejects(api.listMemoryCandidates('mon', id))
})

test('world mismatch rejects before sending and a world change during response rejects stale data', async () => {
  origin = 'local'
  await assert.rejects(api.listMemoryCandidates('mon', id), /世界已切换/)
  assert.equal(sockets.length, 0)
  origin = 'mon'
  page = { items: [], nextCursor: null }
  beforeReply = () => { origin = 'local' }
  await assert.rejects(api.listMemoryCandidates('mon', id), /世界切换前的请求结果未确认/)
})
