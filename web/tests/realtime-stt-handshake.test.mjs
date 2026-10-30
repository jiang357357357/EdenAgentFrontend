import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { WebSocketServer } from 'ws'
import { startRealtimeSpeech } from '../src/lib/realtime-stt-handshake.ts'

function timerWindow(t) {
  const previous = globalThis.window
  globalThis.window = { setTimeout, clearTimeout }
  t.after(() => { globalThis.window = previous })
}

test('real websocket waits for upstream readiness before sending start exactly once', async t => {
  timerWindow(t)
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await once(server, 'listening')
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  t.after(async () => { socket.close(); for (const peer of server.clients) peer.terminate(); await new Promise(resolve => server.close(resolve)) })
  const connection = once(server, 'connection')
  const pending = startRealtimeSpeech(socket, { configId: 1, endSilenceMs: 1200 }, () => true)
  const [peer] = await connection
  const received = []
  peer.on('message', raw => {
    received.push(JSON.parse(raw.toString()))
    peer.send(JSON.stringify({ type: 'status', status: 'started', input_behavior: { auto_finish: true } }))
  })
  if (socket.readyState !== WebSocket.OPEN) await once(socket, 'open')
  await new Promise(resolve => setTimeout(resolve, 25))
  assert.equal(received.length, 0, 'local connection open does not mean the Core/GSV upstream is ready')
  peer.send(JSON.stringify({ type: 'connection', status: 'connected' }))
  peer.send(JSON.stringify({ type: 'connection', status: 'connected' }))
  assert.deepEqual(await pending, { auto_finish: true })
  assert.deepEqual(received, [{ command: 'start', config_id: 1, end_silence_ms: 1200 }])
})

class FixtureSocket extends EventTarget {
  readyState = WebSocket.OPEN
  sent = []
  send(value) { this.sent.push(JSON.parse(value)) }
  message(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })) }
}

test('an already-open socket waits for readiness and does not start after cancellation', async t => {
  timerWindow(t)
  const socket = new FixtureSocket()
  let current = true
  const pending = startRealtimeSpeech(socket, { configId: 1 }, () => current)
  assert.equal(socket.sent.length, 0)
  current = false
  socket.message({ type: 'connection', status: 'connected' })
  await assert.rejects(pending, /语音输入已取消/)
  socket.message({ type: 'connection', status: 'connected' })
  assert.equal(socket.sent.length, 0)
})

test('upstream errors and close before readiness reject without sending start', async t => {
  timerWindow(t)
  const rejected = new FixtureSocket()
  const pending = startRealtimeSpeech(rejected, { configId: 1 }, () => true)
  rejected.message({ type: 'error', message: '配置服务暂不可用' })
  await assert.rejects(pending, /配置服务暂不可用/)
  rejected.message({ type: 'connection', status: 'connected' })
  assert.equal(rejected.sent.length, 0)
  const closed = new FixtureSocket()
  const closing = startRealtimeSpeech(closed, {}, () => true)
  closed.dispatchEvent(new Event('close'))
  await assert.rejects(closing, /语音识别连接已关闭/)
  assert.equal(closed.sent.length, 0)
})
