import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

test('API 2 webview subscribes, receives connector events and releases its subscription', async () => {
  const source = await readFile(new URL('../src/lib/extensions/webview-bootstrap.js', import.meta.url), 'utf8')
  const windowListeners = new Map(), sent = [], parent = {}
  const port = { onmessage: undefined, start() {}, postMessage(value) { sent.push(value) } }
  const window = { fetch: async () => ({ ok: true }), addEventListener(type, listener) { windowListeners.set(type, listener) },
    removeEventListener(type) { windowListeners.delete(type) } }
  const document = { baseURI: 'https://example.invalid/', addEventListener() {} }
  const context = vm.createContext({ window, document, parent, console, URL, setTimeout, clearTimeout, Promise, Object, Map, Set, Error })
  vm.runInContext(source, context)
  windowListeners.get('message')({ source: parent, data: { type: 'eden-extension-connect', context: { viewId: 'main', sessionId: 'session', state: null } }, ports: [port] })
  const api = await window.acquireEdenApi(), received = []
  const subscription = api.onConnectorEvent(event => received.push(event))
  const subscribe = sent.find(item => item.method === 'connector.subscribe')
  assert.ok(subscribe)
  await port.onmessage({ data: { type: 'result', id: subscribe.id, result: null } })
  await port.onmessage({ data: { type: 'connector.event', event: { type: 'event', eventId: 'event-1' } } })
  await port.onmessage({ data: { type: 'connector.event', event: { type: 'resync' } } })
  assert.deepEqual(received, [{ type: 'event', eventId: 'event-1' }, { type: 'resync' }])
  subscription.dispose()
  const unsubscribe = sent.find(item => item.method === 'connector.unsubscribe')
  assert.ok(unsubscribe)
  await port.onmessage({ data: { type: 'result', id: unsubscribe.id, result: null } })
  await port.onmessage({ data: { type: 'connector.event', event: { type: 'resync' } } })
  assert.equal(received.length, 2)
})
