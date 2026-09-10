import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { ObjectUrlScope } from '../src/lib/object-url-scope.ts'
import { blobReference, parseBlobReference } from '../src/lib/blob-reference.ts'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const transport = await vite.ssrLoadModule('/src/lib/rpc-transport.ts')
const client = await vite.ssrLoadModule('/src/lib/agent-client.ts')
const originalWindow = globalThis.window
const originalFetch = globalThis.fetch
let origin = 'mon'
const windowEvents = new EventTarget()
globalThis.window = { addEventListener: windowEvents.addEventListener.bind(windowEvents), removeEventListener: windowEvents.removeEventListener.bind(windowEvents), dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents), localStorage: { getItem: () => origin }, edenAgentDesktop: { getAgentCapability: async () => ({ token: 'w'.repeat(43) }) } }
after(async () => { globalThis.window = originalWindow; globalThis.fetch = originalFetch; await vite.close() })
const id = '11111111-1111-4111-8111-111111111111'

test('persisted attachment events project into stable realm-specific file parts', () => {
  origin = 'mon'
  const projected = transport.projectSessionEvent({ id: 'event', sessionId: 'session', seq: 1n, createdAt: 1n,
    eventType: 'agent.message_end', payload: { messageId: 'message', message: { role: 'user', timestamp: 1, content: [
      { type: 'text', text: 'Look' }, { type: 'attachment', blobId: id, mime: 'image/png', filename: 'pixel.png' },
    ] } } })
  const part = projected.find(event => event.properties?.part?.type === 'file')?.properties.part
  assert.equal(part.url, `eden-blob://mon/${id}`)
  assert.equal(part.filename, 'pixel.png')
  assert.deepEqual(parseBlobReference(part.url), { origin: 'mon', id })
  assert.equal(parseBlobReference(`eden-blob://mon/${id}?token=secret`), undefined)
  assert.throws(() => blobReference('mon', '../escape'))
})

test('ordinary file references survive history mapping as downloadable files', () => {
  const url = blobReference('local', id)
  const message = client.mapMessage({ info: { id: 'message', sessionID: 'session', role: 'user', time: { created: 1 } },
    parts: [{ id: 'file', messageID: 'message', sessionID: 'session', type: 'file', url, mime: 'text/plain', filename: 'note.txt' }] })
  assert.deepEqual(message.files, [{ url, mime: 'text/plain', filename: 'note.txt' }])
  assert.equal(message.images, undefined)
})

test('blob display fetches with authorization, rejects cross-world cached URLs and releases its URL', async () => {
  origin = 'mon'
  const scope = new ObjectUrlScope()
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(String(url), `http://127.0.0.1:40092/blobs/${id}`)
    assert.equal(options.headers.Authorization, `Bearer ${'w'.repeat(43)}`)
    assert.ok(options.signal instanceof AbortSignal)
    return new Response(new Blob(['image'], { type: 'image/png' }))
  }
  try {
    const url = await transport.resolveRuntimeBlobUrl(id, 'mon', scope)
    assert.equal(await (await originalFetch(url)).text(), 'image')
    origin = 'local'
    await assert.rejects(transport.resolveRuntimeBlobUrl(id, 'mon', scope), /another world/)
    assert.equal(calls, 1)
    scope.dispose()
    await assert.rejects(originalFetch(url))
  } finally { scope.dispose(); globalThis.fetch = originalFetch }
})

test('a world switch during credential lookup prevents the blob request', async () => {
  origin = 'mon'
  const scope = new ObjectUrlScope()
  let complete
  window.edenAgentDesktop.getAgentCapability = () => new Promise(resolve => { complete = resolve })
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('Must not fetch') }
  const pending = transport.resolveRuntimeBlobUrl(id, 'mon', scope)
  await Promise.resolve()
  origin = 'local'
  complete({ token: 'old-world-token' })
  await assert.rejects(pending, /World changed/)
  assert.equal(calls, 0)
  scope.dispose()
  window.edenAgentDesktop.getAgentCapability = async () => ({ token: 'w'.repeat(43) })
  globalThis.fetch = originalFetch
})

test('attachment uploads preserve order while limiting concurrent requests to four', async () => {
  origin = 'mon'
  let active = 0
  let peak = 0
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('data:')) return originalFetch(url)
    active++; peak = Math.max(peak, active)
    const value = await options.body.text()
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
    return new Response(JSON.stringify({ id: `${id.slice(0, -2)}${value.padStart(2, '0')}`, mime: 'text/plain', sha256: 'a'.repeat(64), createdAt: 1, byteLength: Buffer.byteLength(value) }), { headers: { 'content-type': 'application/json' } })
  }
  try {
    const files = Array.from({ length: 12 }, (_, index) => ({ url: `data:text/plain,${index}`, filename: `${index}.txt`, mime: 'text/plain' }))
    const uploaded = await transport.uploadAttachments(files)
    assert.equal(peak, 4)
    assert.deepEqual(uploaded.map(file => file.filename), files.map(file => file.filename))
    assert.equal(uploaded.length, 12)
  } finally { globalThis.fetch = originalFetch }
})
