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

test('saved location provenance is forwarded without inventing a new observation time', () => {
  const stored = { location: { country: '中国', region: '海南省', city: '儋州市', source: 'manual_map',
    updated_at: '2026-09-20T08:15:00+08:00', accuracy: 0 } }
  const before = JSON.stringify(stored)
  const snapshot = buildSessionEnvironment(stored, 'Asia/Shanghai', 'zh-CN')
  assert.equal(snapshot.location.source, 'manual_map')
  assert.equal(snapshot.location.updated_at, '2026-09-20T08:15:00+08:00')
  assert.equal(snapshot.location.accuracy, 0)
  assert.equal(JSON.stringify(stored), before)
})

test('legacy or null location metadata stays unknown rather than becoming live browser location', () => {
  for (const location of [{ city: '儋州市' }, { city: '儋州市', source: null, updated_at: null, accuracy: null }]) {
    const snapshot = buildSessionEnvironment({ location }, 'Asia/Shanghai', 'zh-CN')
    assert.equal(snapshot.location.city, '儋州市')
    for (const field of ['source', 'updated_at', 'accuracy']) assert.equal(Object.hasOwn(snapshot.location, field), false)
  }
})
