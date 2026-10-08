import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConnectionFeedback } from '../src/lib/connection-feedback.ts'

function fixture() {
  const states = []
  const feedback = new ConnectionFeedback(state => states.push(state))
  feedback.reset()
  return { feedback, states, get current() { return states.at(-1) } }
}

test('initial connection and initial retry do not claim a recovered snapshot', () => {
  const f = fixture()
  assert.equal(f.current.phase, 'connecting')
  f.feedback.disconnected('网络连接失败')
  assert.equal(f.current.hasConnected, false)
  assert.equal(f.current.phase, 'reconnecting')
  assert.equal(f.feedback.opened().recovering, false)
  assert.equal(f.current.phase, 'idle')
  assert.ok(f.states.every(state => state.phase !== 'restored'))
})

test('reconnection stays restoring until its snapshot request actually completes', () => {
  const f = fixture()
  f.feedback.opened()
  f.feedback.disconnected('客户端接收速度过慢，连接已中断')
  const restored = f.feedback.opened()
  assert.equal(restored.recovering, true)
  assert.equal(f.current.phase, 'restoring')
  f.feedback.synchronized(restored.revision)
  assert.equal(f.current.phase, 'restored')
  f.feedback.dismiss()
  assert.equal(f.current.phase, 'idle')
})

test('failed snapshot recovery stays actionable and a new successful sync clears it', () => {
  const f = fixture()
  f.feedback.opened()
  f.feedback.disconnected('网络中断')
  const opened = f.feedback.opened()
  f.feedback.synchronized(opened.revision, '读取会话历史失败')
  assert.equal(f.current.phase, 'sync-error')
  assert.equal(f.current.reason, '读取会话历史失败')
  f.feedback.dismiss()
  assert.equal(f.current.phase, 'sync-error')
  const retry = f.feedback.synchronizing()
  assert.equal(f.current.phase, 'restoring')
  assert.equal(f.current.reason, undefined)
  f.feedback.synchronized(retry)
  assert.equal(f.current.phase, 'restored')
  f.feedback.synchronized(f.feedback.synchronizing(), '')
  assert.equal(f.current.phase, 'sync-error', 'An empty diagnostic still represents a failed read')
})

test('late success and failure from an earlier recovery cannot overwrite a new disconnection', () => {
  const f = fixture()
  f.feedback.opened()
  f.feedback.disconnected('第一次断开')
  const old = f.feedback.opened()
  f.feedback.disconnected('第二次断开')
  f.feedback.synchronized(old.revision)
  f.feedback.synchronized(old.revision, '旧错误')
  assert.equal(f.current.phase, 'reconnecting')
  assert.equal(f.current.reason, '第二次断开')
  const next = f.feedback.opened()
  f.feedback.synchronized(old.revision)
  assert.equal(f.current.phase, 'restoring')
  f.feedback.synchronized(next.revision)
  assert.equal(f.current.phase, 'restored')
})

test('account or world reset invalidates previous recovery and resets first-connection semantics', () => {
  const f = fixture()
  f.feedback.opened()
  const old = f.feedback.synchronizing()
  f.feedback.reset(false)
  f.feedback.synchronized(old)
  assert.equal(f.current.phase, 'idle')
  assert.equal(f.current.hasConnected, false)
  f.feedback.reset()
  assert.equal(f.current.phase, 'connecting')
  assert.equal(f.feedback.opened().recovering, false)
})
