import { formatLocalMonthDayTime } from './time.ts'

interface Schedule { status: string; nextWakeAt?: string | null; reason: string }

export function selfAwakeScheduleLabel(schedule: Schedule | null, loading: boolean, error: boolean, now: number): string {
  if (error) return '时间读取失败'
  if (schedule?.status === 'unavailable') return '调度不可用'
  if (schedule?.status === 'disabled') return '自醒已暂停'
  if (schedule?.status === 'unscheduled') return '尚未安排'
  const time = schedule?.nextWakeAt
  if (schedule?.status === 'retrying') return `上次失败 · ${time ? `${formatLocalMonthDayTime(time)}${Date.parse(time) <= now ? ' 已到重试时间' : ' 重试'}` : '等待重试计划'}`
  if (time) return Date.parse(time) <= now ? '已到时间，等待唤醒' : formatLocalMonthDayTime(time)
  return loading ? '正在读取' : '暂无调度信息'
}
