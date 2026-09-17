import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, MoreHorizontal, NotebookPen, Plus, RefreshCw, Search, X } from "lucide-react"
import { motion } from "motion/react"
import { MemoNotificationsPanel } from "../../components/memos/MemoNotificationsPanel"
import { MemoJobRecoveryPanel } from "../../components/memos/MemoJobRecoveryPanel"
import type { ApiMemo } from "../../lib/agent-client"
import { pageEnterMotion } from "../../lib/page-motion"
import { cn } from "../../lib/utils"
import { MemoDetail } from "./MemoDetail"
import { MemoEditor } from "./MemoEditor"
import { MemoTimeline } from "./MemoTimeline"
import {
  groupMemos,
  memoLimit,
  memoSchedule,
  scheduleInScope,
  primaryButton,
  secondaryButton,
  type DateScope,
  type KindFilter,
  type StatusFilter,
} from "./memo-presentation"
import { useMemoWorkspace } from "./use-memo-workspace"

export function MemoPage({ onBack }: { onBack: () => void }) {
  const workspace = useMemoWorkspace()
  const [scope, setScope] = useState<DateScope>("all")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [kind, setKind] = useState<KindFilter>("all")
  const [now, setNow] = useState(() => new Date())
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [focusReminder, setFocusReminder] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const filtered = useMemo(
    () =>
      workspace.memos.filter(
        (memo) => (status === "all" || memo.status === status) && (kind === "all" || memo.kind === kind),
      ),
    [workspace.memos, status, kind],
  )
  const groups = useMemo(() => groupMemos(filtered, scope, now), [filtered, scope, now])
  const visible = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const selected = visible.find((memo) => memo.id === workspace.selectedId) ?? visible[0]
  const hasFilters = Boolean(workspace.query.trim() || status !== "all" || kind !== "all" || scope !== "all")
  const resetFilters = () => {
    workspace.setQuery("")
    setStatus("all")
    setKind("all")
    setScope("all")
  }
  const create = () => {
    setFocusReminder(false)
    workspace.openCreate()
  }
  const edit = (memo: ApiMemo, reminder = false) => {
    setFocusReminder(reminder)
    workspace.openEdit(memo)
  }

  const save = async () => {
    const saved = await workspace.save()
    if (!saved) return
    // Keep the saved item visible if its title, status, kind or date moved outside the filters.
    if (workspace.query.trim()) workspace.setQuery("")
    if (status !== "all" && saved.status !== status) setStatus("all")
    if (kind !== "all" && saved.kind !== kind) setKind("all")
    const schedule = memoSchedule(saved)
    if (schedule && !scheduleInScope(schedule.date, scope, now)) setScope("all")
  }

  return (
    <motion.div
      {...pageEnterMotion}
      className="theme-page fixed inset-0 z-10 flex h-dvh w-full flex-col overflow-hidden bg-bg font-sans text-text"
    >
      <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-3 border-b border-border/70 px-4 py-4 lg:gap-5 lg:px-7">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回聊天"
          title="返回聊天"
          className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2.5">
          <NotebookPen className="hidden h-5 w-5 text-accent sm:block" />
          <h1 className="whitespace-nowrap text-xl font-semibold tracking-tight">备忘录</h1>
        </div>
        <label className="order-last flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-input px-3 sm:order-none sm:ml-2 sm:w-auto sm:max-w-lg sm:flex-1">
          <Search className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            aria-label="搜索备忘"
            value={workspace.query}
            onChange={(event) => workspace.setQuery(event.target.value)}
            placeholder="搜索标题或正文…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-lighter"
          />
          {workspace.query && (
            <button
              type="button"
              onClick={() => workspace.setQuery("")}
              aria-label="清除搜索"
              className="rounded p-1 text-text-muted hover:text-text"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <div className="ml-auto flex items-center gap-2">
          <MemoNotificationsPanel />
          <div
            className="relative"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setRecoveryOpen(false)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setRecoveryOpen(false)
            }}
          >
            <button
              type="button"
              aria-label="更多操作"
              aria-expanded={recoveryOpen}
              onClick={() => setRecoveryOpen((value) => !value)}
              className={secondaryButton}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {recoveryOpen && (
              <div className="absolute right-0 top-full z-30 mt-2 min-w-48 rounded-xl border border-border bg-card p-2 shadow-xl">
                <MemoJobRecoveryPanel />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void workspace.refresh()}
            disabled={workspace.loading || workspace.saving}
            aria-label="刷新备忘"
            title="刷新备忘"
            className={cn(secondaryButton, "hidden sm:inline-flex")}
          >
            <RefreshCw className={cn("h-4 w-4", workspace.loading && "animate-spin")} />
          </button>
          <button type="button" disabled={workspace.saving} onClick={create} className={primaryButton}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">新建备忘</span>
            <span className="sm:hidden">新建</span>
          </button>
        </div>
      </header>
      {workspace.error && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-lg border border-danger/30 bg-danger-dim px-4 py-2 text-sm text-danger lg:mx-7"
        >
          {workspace.error}
          <button
            type="button"
            onClick={() => void workspace.refresh()}
            disabled={workspace.loading}
            className="ml-3 underline disabled:opacity-50"
          >
            重试
          </button>
        </div>
      )}
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(14rem,1fr)_minmax(18rem,1.2fr)] gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:grid-rows-1 lg:overflow-hidden lg:p-6">
        <MemoTimeline
          groups={groups}
          selectedId={selected?.id}
          scope={scope}
          status={status}
          kind={kind}
          loading={workspace.loading}
          hasFilters={hasFilters}
          limited={workspace.memos.length >= memoLimit}
          failed={Boolean(workspace.error)}
          onScope={setScope}
          onStatus={setStatus}
          onKind={setKind}
          onSelect={(memo) => workspace.setSelectedId(memo.id)}
          onEdit={edit}
          onCreate={create}
          onReset={resetFilters}
        />
        <MemoDetail
          memo={selected}
          saving={workspace.saving}
          onEdit={edit}
          onAction={(memo, action) => void workspace.act(memo, action)}
          onCreate={create}
        />
      </main>
      <MemoEditor
        open={workspace.editorOpen}
        memo={workspace.editingMemo}
        focusReminder={focusReminder}
        form={workspace.form}
        setForm={workspace.setForm}
        saving={workspace.saving}
        error={workspace.editorError}
        onClose={workspace.closeEditor}
        onSave={() => void save()}
      />
    </motion.div>
  )
}
