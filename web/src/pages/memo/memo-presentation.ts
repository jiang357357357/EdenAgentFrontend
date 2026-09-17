import { Bell, ListChecks, NotebookPen } from "lucide-react"
import type { ApiMemo, ApiMemoKind, ApiMemoPriority, ApiMemoStatus } from "../../lib/agent-client"

export const kindMeta = {
  note: { label: "备忘", icon: NotebookPen },
  reminder: { label: "提醒", icon: Bell },
  todo: { label: "待办", icon: ListChecks },
} satisfies Record<ApiMemoKind, { label: string; icon: typeof Bell }>

export const statusMeta = {
  active: { label: "进行中", tone: "border-accent/20 bg-accent-dim text-accent" },
  done: { label: "已完成", tone: "border-success/20 bg-success-dim text-success" },
  archived: { label: "已归档", tone: "border-border bg-bg text-text-muted" },
  cancelled: { label: "已取消", tone: "border-border bg-bg text-text-muted" },
} satisfies Record<ApiMemoStatus, { label: string; tone: string }>

export const priorityLabels: Record<ApiMemoPriority, string> = { low: "低", normal: "普通", high: "高" }
export type DateScope = "today" | "week" | "all"
export type StatusFilter = "all" | ApiMemoStatus
export type KindFilter = "all" | ApiMemoKind
export type MemoGroup = { key: string; label: string; dateLabel: string; items: ApiMemo[] }
export const memoLimit = 160
export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
export const fieldClass =
  "w-full min-w-0 rounded-lg border border-border bg-input px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"

export function parseMemoDate(value?: string | null): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** An undated note remains undated; creation time is never a reminder. */
export function memoSchedule(memo: ApiMemo) {
  const candidates = [
    [memo.snoozed_until, "延后至"],
    [memo.trigger_at, "提醒时间"],
    [memo.remind_at, "提醒时间"],
    [memo.due_at, "截止时间"],
  ] as const
  for (const [value, label] of candidates) {
    const date = parseMemoDate(value)
    if (date) return { date, label: !memo.snoozed_until && !memo.remind_at && memo.due_at ? "截止时间" : label }
  }
  return undefined
}

export function fullDate(value?: string | null) {
  const date = parseMemoDate(value)
  return date
    ? date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "未设置"
}

export function clockLabel(date: Date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function dayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
function nextDay(date: Date, offset: number) {
  const next = dayStart(date)
  next.setDate(next.getDate() + offset)
  return next
}
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function scheduleInScope(date: Date, scope: DateScope, now: Date) {
  if (scope === "all") return true
  const start = scope === "today" ? dayStart(now) : nextDay(now, -((now.getDay() + 6) % 7))
  const end = nextDay(start, scope === "today" ? 1 : 7)
  return date >= start && date < end
}

export function groupMemos(memos: ApiMemo[], scope: DateScope, now: Date): MemoGroup[] {
  const dated = new Map<string, MemoGroup>()
  const undated: ApiMemo[] = []
  for (const memo of memos) {
    const schedule = memoSchedule(memo)
    if (!schedule) {
      undated.push(memo)
      continue
    }
    if (!scheduleInScope(schedule.date, scope, now)) continue
    const key = dayKey(schedule.date)
    const label =
      key === dayKey(now)
        ? "今天"
        : key === dayKey(nextDay(now, 1))
          ? "明天"
          : key === dayKey(nextDay(now, -1))
            ? "昨天"
            : key
    const group = dated.get(key) ?? {
      key,
      label,
      dateLabel: schedule.date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }),
      items: [],
    }
    group.items.push(memo)
    dated.set(key, group)
  }
  const groups = [...dated.values()].sort((left, right) => left.key.localeCompare(right.key))
  for (const group of groups)
    group.items.sort((a, b) => memoSchedule(a)!.date.getTime() - memoSchedule(b)!.date.getTime() || a.id - b.id)
  if (undated.length)
    groups.push({
      key: "undated",
      label: "未设置提醒",
      dateLabel: "随时记录，不加入时间安排",
      items: undated.sort(
        (a, b) =>
          (parseMemoDate(b.updated_at)?.getTime() ?? 0) - (parseMemoDate(a.updated_at)?.getTime() ?? 0) || b.id - a.id,
      ),
    })
  return groups
}
