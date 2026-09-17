import { Archive, Bell, CalendarDays, CheckCircle2, Clock3, NotebookPen, Pencil, TimerReset } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ApiMemo } from "../../lib/agent-client"
import { cn } from "../../lib/utils"
import { fullDate, kindMeta, memoSchedule, priorityLabels, secondaryButton, statusMeta } from "./memo-presentation"

interface MemoDetailProps {
  memo?: ApiMemo
  saving: boolean
  onEdit: (memo: ApiMemo, focusReminder?: boolean) => void
  onAction: (memo: ApiMemo, action: "complete" | "archive" | "snooze") => void
  onCreate: () => void
}

export function MemoDetail({ memo, saving, onEdit, onAction, onCreate }: MemoDetailProps) {
  const schedule = memo && memoSchedule(memo)
  const Icon = memo ? kindMeta[memo.kind].icon : NotebookPen
  return (
    <section
      aria-label="备忘详情"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card"
    >
      {!memo ? (
        <div className="flex h-full min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
          <NotebookPen className="h-9 w-9 text-text-muted" />
          <h2 className="text-lg font-medium">留一点空间，给接下来的事</h2>
          <p className="text-sm text-text-muted">从左侧选择备忘，或记录一个新的想法。</p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-2 rounded-lg bg-accent-dim px-4 py-2 text-sm text-accent hover:bg-accent/25"
          >
            新建备忘
          </button>
        </div>
      ) : (
        <>
          <header className="shrink-0 border-b border-border/60 px-5 pb-5 pt-5 xl:px-7 xl:pt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs text-text-muted">
                <Icon className="h-4 w-4" />
                {kindMeta[memo.kind].label}
              </span>
              <button type="button" onClick={() => onEdit(memo)} disabled={saving} className={secondaryButton}>
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
            </div>
            <h2 className="break-words text-xl font-semibold leading-relaxed tracking-tight xl:text-2xl">
              {memo.title}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                  statusMeta[memo.status].tone,
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {statusMeta[memo.status].label}
              </span>
              {memo.priority !== "normal" && (
                <span className={memo.priority === "high" ? "text-warning" : "text-text-muted"}>
                  {priorityLabels[memo.priority]}优先级
                </span>
              )}
            </div>
          </header>
          <div className="surface-scrollbars min-h-0 flex-1 overflow-y-auto px-5 py-5 xl:px-7">
            <div className="prose prose-sm max-w-none break-words text-[15px] leading-7 text-text [overflow-wrap:anywhere] prose-headings:font-semibold prose-headings:text-text prose-p:my-3 prose-ul:my-3 prose-li:my-1 prose-pre:overflow-x-auto prose-pre:bg-code prose-pre:text-text">
              {memo.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ children, href }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent">
                        {children}
                      </a>
                    ),
                    img: ({ alt }) => <span className="text-text-muted">[图片{alt ? `：${alt}` : ""}]</span>,
                    input: ({ checked }) => (
                      <input
                        type="checkbox"
                        checked={Boolean(checked)}
                        disabled
                        aria-label={checked ? "已勾选的清单项（只读）" : "未勾选的清单项（只读）"}
                        className="mr-2 accent-accent"
                      />
                    ),
                  }}
                >
                  {memo.content}
                </ReactMarkdown>
              ) : (
                <p className="text-text-muted">还没有正文，点击编辑补充内容。</p>
              )}
            </div>
            <div className="mt-7 rounded-xl border border-border/80 bg-bg/60 p-4">
              <div className="flex items-start gap-3">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-text-muted">{schedule?.label || "提醒"}</p>
                  <p
                    className={cn(
                      "mt-1.5 break-words text-sm font-medium",
                      schedule ? "text-accent" : "text-text-muted",
                    )}
                  >
                    {schedule ? fullDate(schedule.date.toISOString()) : "未设置提醒"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(memo, true)}
                  disabled={saving}
                  className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs text-accent hover:bg-accent-dim disabled:opacity-50"
                >
                  {schedule ? "修改提醒" : "设置提醒"}
                </button>
              </div>
              <dl className="mt-4 grid gap-3 border-t border-border/60 pt-4 text-xs">
                {memo.due_at && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="flex items-center gap-2 text-text-muted">
                      <Clock3 className="h-3.5 w-3.5" />
                      截止时间
                    </dt>
                    <dd>{fullDate(memo.due_at)}</dd>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="flex items-center gap-2 text-text-muted">
                    <CalendarDays className="h-3.5 w-3.5" />
                    创建时间
                  </dt>
                  <dd className="text-text-muted">{fullDate(memo.created_at)}</dd>
                </div>
              </dl>
            </div>
          </div>
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 px-5 py-3 xl:px-7">
            <button
              type="button"
              disabled={saving || memo.status !== "active"}
              onClick={() => onAction(memo, "complete")}
              className={secondaryButton}
            >
              <CheckCircle2 className="h-4 w-4 text-success" />
              标记完成
            </button>
            <button
              type="button"
              disabled={saving || memo.status !== "active"}
              onClick={() => onAction(memo, "snooze")}
              className={secondaryButton}
            >
              <TimerReset className="h-4 w-4" />
              30 分钟后
            </button>
            <button
              type="button"
              disabled={saving || memo.status === "archived"}
              onClick={() => onAction(memo, "archive")}
              className={cn(secondaryButton, "ml-auto")}
            >
              <Archive className="h-4 w-4" />
              归档
            </button>
          </footer>
        </>
      )}
    </section>
  )
}
