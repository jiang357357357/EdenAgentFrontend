import { Bell, CalendarDays, ChevronDown, LoaderCircle, NotebookPen, Plus } from "lucide-react"
import type { ApiMemo } from "../../lib/agent-client"
import { cn } from "../../lib/utils"
import {
  clockLabel,
  kindMeta,
  memoSchedule,
  statusMeta,
  type DateScope,
  type KindFilter,
  type MemoGroup,
  type StatusFilter,
} from "./memo-presentation"

interface MemoTimelineProps {
  groups: MemoGroup[]
  selectedId?: number
  scope: DateScope
  status: StatusFilter
  kind: KindFilter
  loading: boolean
  hasFilters: boolean
  limited: boolean
  failed: boolean
  onScope: (scope: DateScope) => void
  onStatus: (status: StatusFilter) => void
  onKind: (kind: KindFilter) => void
  onSelect: (memo: ApiMemo) => void
  onEdit: (memo: ApiMemo) => void
  onCreate: () => void
  onReset: () => void
}

export function MemoTimeline(props: MemoTimelineProps) {
  const count = props.groups.reduce((total, group) => total + group.items.length, 0)
  return (
    <section
      aria-label="备忘时间列表"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex rounded-lg bg-bg p-1" role="group" aria-label="定时备忘日期范围">
          {(
            [
              ["today", "今天"],
              ["week", "本周"],
              ["all", "全部"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={props.scope === value}
              onClick={() => props.onScope(value)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm transition-colors",
                props.scope === value
                  ? "bg-accent-dim text-accent"
                  : "text-text-muted hover:text-text hover:bg-surface-hover",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select
            aria-label="按状态筛选"
            value={props.status}
            onChange={(event) => props.onStatus(event.target.value as StatusFilter)}
            className="max-w-32 rounded-lg border border-border bg-input px-2 py-1.5 text-xs text-text-muted"
          >
            <option value="all">全部状态</option>
            {Object.entries(statusMeta).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
          <select
            aria-label="按类型筛选"
            value={props.kind}
            onChange={(event) => props.onKind(event.target.value as KindFilter)}
            className="max-w-32 rounded-lg border border-border bg-input px-2 py-1.5 text-xs text-text-muted"
          >
            <option value="all">全部类型</option>
            {Object.entries(kindMeta).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="surface-scrollbars min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-busy={props.loading}>
        {props.loading && !count ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-text-muted" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            正在加载备忘…
          </div>
        ) : props.failed && !count ? (
          <div className="flex min-h-48 items-center justify-center px-6 text-sm text-text-muted">
            暂时无法读取备忘，请重试。
          </div>
        ) : !count ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
            <NotebookPen className="h-8 w-8 text-text-muted" />
            <p className="text-sm text-text">{props.hasFilters ? "没有符合条件的备忘" : "把想记住的事放在这里"}</p>
            <p className="max-w-64 text-xs leading-6 text-text-muted">
              {props.hasFilters ? "试试其他日期、状态或关键词。" : "设置提醒后，备忘会出现在对应的时间下。"}
            </p>
            <button
              type="button"
              onClick={props.hasFilters ? props.onReset : props.onCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-dim px-3 py-2 text-sm text-accent hover:bg-accent/25"
            >
              <Plus className="h-4 w-4" />
              {props.hasFilters ? "清除筛选" : "新建备忘"}
            </button>
          </div>
        ) : (
          props.groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-1 bg-card px-2 py-4 text-xs text-text-muted">
                {group.key === "undated" ? (
                  <NotebookPen className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                <h2 className="text-sm font-semibold text-text">{group.label}</h2>
                <span className="tabular-nums">{group.items.length}</span>
                <span className="ml-1 text-xs">{group.dateLabel}</span>
              </header>
              <div className="space-y-1">
                {group.items.map((memo) => (
                  <TimelineRow
                    key={memo.id}
                    memo={memo}
                    selected={memo.id === props.selectedId}
                    onSelect={props.onSelect}
                    onEdit={props.onEdit}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-5 py-3 text-xs text-text-muted">
        <span>
          {count} 条备忘{props.limited ? " · 当前结果最多 160 条，可搜索缩小范围" : ""}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          按本地时间排列
        </span>
      </footer>
    </section>
  )
}

function TimelineRow({
  memo,
  selected,
  onSelect,
  onEdit,
}: {
  memo: ApiMemo
  selected: boolean
  onSelect: (memo: ApiMemo) => void
  onEdit: (memo: ApiMemo) => void
}) {
  const schedule = memoSchedule(memo)
  const Icon = kindMeta[memo.kind].icon
  return (
    <button
      type="button"
      onClick={() => onSelect(memo)}
      onDoubleClick={() => onEdit(memo)}
      aria-pressed={selected}
      className={cn(
        "group relative grid w-full grid-cols-[3.25rem_0.75rem_minmax(0,1fr)] items-start gap-x-3 rounded-lg border px-3 py-3.5 text-left transition-colors sm:grid-cols-[3.5rem_0.75rem_minmax(0,1fr)]",
        selected ? "border-accent/25 bg-accent-dim" : "border-transparent hover:bg-surface-hover/60",
      )}
    >
      <span
        className={cn("pt-0.5 text-xs tabular-nums", selected ? "text-accent" : "text-text-muted")}
        title={schedule ? `${schedule.label} ${schedule.date.toLocaleString()}` : "未设置提醒"}
      >
        {schedule ? clockLabel(schedule.date) : <Icon className="mx-auto h-4 w-4" />}
      </span>
      <span className="relative flex h-full min-h-12 justify-center pt-1.5" aria-hidden="true">
        <span className="absolute -bottom-4 top-3 w-px bg-border/70" />
        <span
          className={cn(
            "relative h-2 w-2 rounded-full",
            selected ? "bg-accent" : memo.status === "done" ? "bg-success" : "bg-text-muted/60",
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{memo.title}</span>
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", statusMeta[memo.status].tone)}>
            {statusMeta[memo.status].label}
          </span>
          {schedule && <Bell className={cn("h-3.5 w-3.5", selected ? "text-accent" : "text-text-muted")} />}
        </span>
        <span className="mt-1.5 block truncate text-xs leading-5 text-text-muted">
          {memo.content?.replace(/\s+/g, " ") || kindMeta[memo.kind].label}
        </span>
        {memo.priority === "high" && <span className="mt-1 inline-block text-[11px] text-warning">高优先级</span>}
      </span>
    </button>
  )
}
