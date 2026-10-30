import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate as immediate, setTimeout as delay } from 'node:timers/promises'
import { recoverPreferenceRead, isPreferenceReadConnectionError, preferenceReadReconnecting } from '../src/lib/preference-read.ts'

test('interrupted preference reads recover and clear their temporary error', async () => {
  let calls = 0
  const errors = []
  let finish
  const done = new Promise(resolve => { finish = resolve })
  const stop = recoverPreferenceRead({ current: () => true, label: '读取失败',
    read: async () => { if (++calls === 1) throw new Error('RPC connection closed; pending execution outcomes are unconfirmed'); return 42 },
    failed: error => errors.push(error), loaded: value => finish(value) })
  assert.equal(await done, 42); stop()
  assert.equal(calls, 2)
  assert.deepEqual(errors, [preferenceReadReconnecting, undefined])
})

test('permission and protocol failures remain errors and are never connection retries', async () => {
  const denied = new Error('没有读取权限'); denied.name = 'AgentRpcError'
  for (const reason of [denied, new Error('Invalid RPC response; execution outcome is unconfirmed'), new Error('invalid preference schema')])
    assert.equal(isPreferenceReadConnectionError(reason), false)
  let calls = 0, diagnostic
  const stop = recoverPreferenceRead({ current: () => true, label: '读取设置失败', read: async () => { calls++; throw denied },
    loaded: () => assert.fail('Denied request cannot succeed'), failed: error => { diagnostic = error } })
  await immediate(); assert.equal(diagnostic, '读取设置失败：没有读取权限')
  await delay(550); stop(); assert.equal(calls, 1)
})

test('disposing a read cancels scheduled recovery and rejects late completions', async () => {
  let calls = 0
  const stop = recoverPreferenceRead({ current: () => true, label: '读取失败', read: async () => { calls++; throw new Error('Eden Agent RPC client is not connected') },
    loaded: () => assert.fail('Disposed read cannot publish'), failed: () => {} })
  await immediate(); stop(); await delay(550); assert.equal(calls, 1)
  let resolve, current = true
  const cancel = recoverPreferenceRead({ current: () => current, label: '读取失败', read: () => new Promise(done => { resolve = done }),
    loaded: () => assert.fail('Old account result cannot publish'), failed: () => assert.fail('Old account error cannot publish') })
  current = false; resolve(42); await immediate(); cancel()
})
