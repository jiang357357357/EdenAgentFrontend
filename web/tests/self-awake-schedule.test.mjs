import assert from 'node:assert/strict'
import test from 'node:test'
import { selfAwakeScheduleLabel } from '../src/lib/self-awake-schedule.ts'

test('unavailable, unknown, disabled and genuinely unplanned schedules have distinct labels', () => {
  const now = Date.now()
  assert.equal(selfAwakeScheduleLabel({ status: 'unavailable', nextWakeAt: null, reason: '未配置' }, false, false, now), '调度不可用')
  assert.equal(selfAwakeScheduleLabel(null, false, false, now), '暂无调度信息')
  assert.equal(selfAwakeScheduleLabel(null, true, false, now), '正在读取')
  assert.equal(selfAwakeScheduleLabel(null, false, true, now), '时间读取失败')
  assert.equal(selfAwakeScheduleLabel({ status: 'disabled', nextWakeAt: null, reason: '' }, false, false, now), '自醒已暂停')
  assert.equal(selfAwakeScheduleLabel({ status: 'unscheduled', nextWakeAt: null, reason: '' }, false, false, now), '尚未安排')
})

test('only actual timestamps produce countdown or retry information', () => {
  const now = Date.now(), schedule = { status: 'scheduled', nextWakeAt: new Date(now - 1000).toISOString(), reason: '' }
  assert.equal(selfAwakeScheduleLabel(schedule, false, false, now), '已到时间，等待唤醒')
  assert.match(selfAwakeScheduleLabel({ ...schedule, status: 'retrying' }, false, false, now), /已到重试时间/)
  assert.match(selfAwakeScheduleLabel({ ...schedule, nextWakeAt: new Date(now + 3600000).toISOString() }, false, false, now), /\d{2}:\d{2}/)
})
