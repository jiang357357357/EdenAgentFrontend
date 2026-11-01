import assert from 'node:assert/strict'
import test from 'node:test'
import { selfAwakeControlState } from '../src/lib/self-awake-control-state.ts'

const now = Date.now(), control = { enabled: true, updatedAt: 7, publicationError: null,
  schedule: { status: 'scheduled', nextWakeAt: new Date(now + 3600000).toISOString(), reason: '角色安排' } }
const scheduler = (status) => ({ status, message: `诊断：${status}`, checkedAt: now, expiresAt: now + 30000, enabled: true, controlUpdatedAt: 7 })

for (const [status, label] of [['unconfigured', '尚未配置调度'], ['unavailable', '调度尚未启动'], ['expired', '调度连接中断'],
  ['incompatible', '调度协议不匹配'], ['wrong_account', '调度账号不匹配'], ['failed', '调度异常']]) {
  test(`${status} overrides stale scheduled time without claiming a model wake failure`, () => {
    const result = selfAwakeControlState({ ...control, scheduler: scheduler(status) }, '', now)
    assert.equal(result.label, label); assert.equal(result.issue, `诊断：${status}`)
    assert.notEqual(result.label, '唤醒失败')
  })
}

test('confirmed pause remains paused while the scheduler is alive or disconnected', () => {
  for (const status of ['paused', 'expired', 'starting']) {
    assert.equal(selfAwakeControlState({ ...control, enabled: false, scheduler: scheduler(status) }, '', now).label, '自醒已暂停')
  }
})

test('startup and asynchronous enable are pending states, while a ready clock preserves the real schedule', () => {
  assert.deepEqual(selfAwakeControlState({ ...control, scheduler: scheduler('starting') }, '', now), { label: '调度启动中', issue: '' })
  assert.deepEqual(selfAwakeControlState({ ...control, scheduler: scheduler('paused') }, '', now), { label: '正在开启自醒', issue: '' })
  assert.match(selfAwakeControlState({ ...control, scheduler: scheduler('ready') }, '', now).label, /\d{2}:\d{2}/)
  assert.equal(selfAwakeControlState(control, '读取失败', now).label, '状态读取失败')
})
