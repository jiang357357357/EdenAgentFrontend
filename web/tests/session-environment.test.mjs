import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSessionEnvironment } from '../src/lib/session-environment.ts'

test('user environment overrides browser defaults and preserves coordinates for host storage', () => {
  const stored = { timezone: ' Asia/Shanghai ', locale: ' zh-CN ', location: { country: '中国', city: '上海', latitude: 31.23, longitude: 121.47 }, privateToken: 'not-environment' }
  const snapshot = buildSessionEnvironment(stored, 'UTC', 'en-US')
  assert.equal(snapshot.timezone, 'Asia/Shanghai')
  assert.equal(snapshot.locale, 'zh-CN')
  assert.equal(snapshot.location.latitude, 31.23)
  assert.equal(snapshot.location.longitude, 121.47)
  assert.equal(snapshot.privateToken, undefined)
  snapshot.location.city = 'changed'
  assert.equal(stored.location.city, '上海')
})

test('missing user settings fall back to the browser without undefined coordinate fields', () => {
  const snapshot = buildSessionEnvironment(undefined, 'UTC', 'en-US')
  assert.equal(snapshot.timezone, 'UTC')
  assert.equal(snapshot.locale, 'en-US')
  assert.equal(Object.hasOwn(snapshot.location, 'latitude'), false)
  assert.equal(buildSessionEnvironment({ timezone: ' ' }, '', '').locale, 'zh-CN')
})
