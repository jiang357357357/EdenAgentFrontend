import type { SelfAwakeSchedulerStatus } from '@eden/api'
import { selfAwakeScheduleLabel } from './self-awake-schedule.ts'

interface Control {
  enabled: boolean; updatedAt: number; publicationError?: string | null
  scheduler?: SelfAwakeSchedulerStatus
  schedule?: { status: string; nextWakeAt?: string | null; reason: string } | null
}
const schedulerLabels = {
  unconfigured: '尚未配置调度', unavailable: '调度尚未启动', expired: '调度连接中断',
  incompatible: '调度协议不匹配', wrong_account: '调度账号不匹配', failed: '调度异常', starting: '调度启动中',
}

export function selfAwakeControlState(control: Control | null, error: string, now: number): { label: string; issue: string } {
  if (error) return { label: '状态读取失败', issue: error }
  if (!control) return { label: '正在读取', issue: '' }
  const scheduler = control.scheduler
  if (!control.enabled) return { label: '自醒已暂停', issue: control.publicationError ? `自醒已关闭，调度同步等待恢复：${control.publicationError}` : '' }
  if (scheduler && scheduler.status in schedulerLabels) return {
    label: schedulerLabels[scheduler.status as keyof typeof schedulerLabels],
    issue: scheduler.status === 'starting' ? '' : scheduler.message,
  }
  if (scheduler?.status === 'paused') return { label: '正在开启自醒', issue: '' }
  const label = selfAwakeScheduleLabel(control.schedule ?? null, false, false, now)
  const schedule = control.schedule
  const issue = control.publicationError ? `设置已保存，调度同步等待恢复：${control.publicationError}`
    : schedule && ['unavailable', 'failed', 'blocked', 'overdue', 'retrying'].includes(schedule.status) ? schedule.reason : ''
  return { label, issue }
}
