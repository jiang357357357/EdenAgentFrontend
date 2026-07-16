import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Archive,
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ListChecks,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  TimerReset,
  X,
} from "lucide-react"
import { motion } from "motion/react"
import {
  archiveMemo,
  completeMemo,
  createMemo,
  listMemos,
  snoozeMemo,
  updateMemo,
  type ApiMemo,
  type ApiMemoKind,
  type ApiMemoPriority,
  type ApiMemoStatus,
} from "../../lib/mon_agent_api"
import { cn } from "../../lib/utils"
import { formatLocalMonthDayTime, fromDateTimeLocalInputValue, toDateTimeLocalInputValue } from "../../lib/time"
import diaryPaperTexture from "../../assets/self-awake/diary-paper.png"
import memoWorkspaceBackground from "../../assets/self-awake/memo-workspace-bg-v2.png"

const screenMotion = {
  initial: { opacity: 0, y: 16, filter: "blur(3px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: 18, filter: "blur(3px)" },
}

const transition = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
} as const

const kindMeta: Record<ApiMemoKind, { label: string; icon: typeof NotebookPen; tone: string; rail: string }> = {
  note: {
    label: "备忘",
    icon: NotebookPen,
    tone: "border-stone-200/70 bg-white/40 text-stone-700",
    rail: "bg-stone-300/80",
  },
  reminder: {
    label: "提醒",
    icon: Bell,
    tone: "border-stone-200/70 bg-white/40 text-stone-700",
    rail: "bg-stone-400/80",
  },
  todo: {
    label: "待办",
    icon: ListChecks,
    tone: "border-stone-200/70 bg-white/40 text-stone-700",
    rail: "bg-stone-400/80",
  },
}

const statusMeta: Record<ApiMemoStatus, { label: string; tone: string }> = {
  active: { label: "进行中", tone: "border-stone-200/70 bg-white/42 text-stone-700" },
  done: { label: "已完成", tone: "border-stone-200/70 bg-stone-100/52 text-stone-500" },
  archived: { label: "已归档", tone: "border-stone-200/70 bg-stone-100/52 text-stone-500" },
  cancelled: { label: "已取消", tone: "border-stone-200/70 bg-stone-100/52 text-stone-500" },
}

const kindOptions: PaperSelectOption<ApiMemoKind>[] = [
  { value: "note", label: "备忘" },
  { value: "reminder", label: "提醒" },
  { value: "todo", label: "待办" },
]

const priorityOptions: PaperSelectOption<ApiMemoPriority>[] = [
  { value: "low", label: "低" },
  { value: "normal", label: "普通" },
  { value: "high", label: "高" },
]

const statusOptions: PaperSelectOption<ApiMemoStatus>[] = [
  { value: "active", label: "进行中" },
  { value: "done", label: "已完成" },
  { value: "archived", label: "已归档" },
  { value: "cancelled", label: "已取消" },
]

type StatusFilter = "active" | "done" | "archived" | "all"
type KindFilter = "all" | ApiMemoKind
type EditorMode = "create" | "edit"

interface MemoPageProps {
  onBack: () => void
}

function triggerLabel(memo: ApiMemo) {
  if (memo.snoozed_until) return `稍后 ${formatLocalMonthDayTime(memo.snoozed_until)}`
  if (memo.remind_at) return `提醒 ${formatLocalMonthDayTime(memo.remind_at)}`
  if (memo.due_at) return `截止 ${formatLocalMonthDayTime(memo.due_at)}`
  return "未定时"
}

function memoTimestamp(memo: ApiMemo) {
  return memo.trigger_at || memo.remind_at || memo.due_at || memo.created_at
}

function parseMemoDate(value?: string | null) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function pad2(value: number) {
  return String(value).padStart(2, "0")
}

function memoDateKey(value?: string | null) {
  const date = parseMemoDate(value)
  if (!date) return "unknown"
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function memoClock(value?: string | null) {
  const date = parseMemoDate(value)
  if (!date) return "--:--"
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function memoFullDateTime(value?: string | null) {
  const date = parseMemoDate(value)
  if (!date) return "未设置"
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function memoDateGroupLabel(value?: string | null) {
  const date = parseMemoDate(value)
  if (!date) return "未设置日期"
  const now = new Date()
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  return `${memoDateKey(value)}${isToday ? "（今天）" : ""}`
}

function paperStyle(alpha = 0.54) {
  return {
    backgroundImage: `linear-gradient(rgba(255, 253, 248, ${alpha}), rgba(255, 253, 248, ${alpha})), url(${diaryPaperTexture})`,
    backgroundSize: "auto, 560px auto",
  }
}

interface PaperSelectOption<T extends string> {
  label: string
  value: T
}

function PaperSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: PaperSelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value) ?? options[0]

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-[4.6vh] w-full items-center justify-between rounded-[0.65vh] border border-stone-200/65 bg-white/38 px-[1.2vh] text-[1.48vh] text-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition-colors",
          "hover:border-stone-300/80 hover:bg-white/56 focus:border-stone-400/70 focus:outline-none",
          disabled && "cursor-not-allowed opacity-55",
        )}
      >
        <span>{selected.label}</span>
        <ChevronDown className={cn("h-[1.55vh] w-[1.55vh] text-stone-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.45vh)] z-30 overflow-hidden rounded-[0.75vh] border border-stone-200/70 bg-white/72 p-[0.45vh] shadow-[0_1.2vh_3.2vh_rgba(87,83,78,0.16)] backdrop-blur-md"
          style={paperStyle(0.72)}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              className={cn(
                "flex h-[4vh] w-full items-center rounded-[0.55vh] px-[1vh] text-left text-[1.45vh] text-stone-700 transition-colors",
                option.value === value ? "bg-stone-200/44 text-stone-950" : "hover:bg-white/60",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function emptyForm() {
  return {
    title: "",
    content: "",
    kind: "note" as ApiMemoKind,
    status: "active" as ApiMemoStatus,
    priority: "normal" as ApiMemoPriority,
    remindAt: "",
    dueAt: "",
  }
}

export function MemoPage({ onBack }: MemoPageProps) {
  const [memos, setMemos] = useState<ApiMemo[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [kindFilter, setKindFilter] = useState<KindFilter>("all")
  const [editorMode, setEditorMode] = useState<EditorMode>("create")
  const [editingMemo, setEditingMemo] = useState<ApiMemo | undefined>()
  const [selectedMemoId, setSelectedMemoId] = useState<number | undefined>()
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const loadMemos = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const data = await listMemos({
        q: query.trim() || undefined,
        limit: 160,
      })
      setMemos(data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void loadMemos()
  }, [loadMemos])

  const activeCount = memos.filter((memo) => memo.status === "active").length
  const doneCount = memos.filter((memo) => memo.status === "done").length
  const noteCount = memos.filter((memo) => memo.kind === "note").length
  const reminderCount = memos.filter((memo) => memo.kind === "reminder").length
  const todoCount = memos.filter((memo) => memo.kind === "todo").length
  const nextMemo = memos
    .filter((memo) => memo.status === "active" && memo.trigger_at)
    .sort((left, right) => new Date(left.trigger_at || 0).getTime() - new Date(right.trigger_at || 0).getTime())[0]

  const statusFilterOptions = useMemo<PaperSelectOption<StatusFilter>[]>(
    () => [
      { value: "active", label: `状态 进行中 ${activeCount}` },
      { value: "done", label: `状态 已完成 ${doneCount}` },
      { value: "archived", label: `状态 已归档 ${memos.filter((memo) => memo.status === "archived").length}` },
      { value: "all", label: `状态 全部 ${memos.length}` },
    ],
    [activeCount, doneCount, memos],
  )

  const kindFilterOptions = useMemo<PaperSelectOption<KindFilter>[]>(
    () => [
      { value: "all", label: `类型 全部 ${memos.length}` },
      { value: "note", label: `类型 备忘 ${noteCount}` },
      { value: "reminder", label: `类型 提醒 ${reminderCount}` },
      { value: "todo", label: `类型 待办 ${todoCount}` },
    ],
    [memos.length, noteCount, reminderCount, todoCount],
  )

  const visibleMemos = useMemo(() => {
    return memos.filter((memo) => {
      const matchesStatus = statusFilter === "all" || memo.status === statusFilter
      const matchesKind = kindFilter === "all" || memo.kind === kindFilter
      return matchesStatus && matchesKind
    })
  }, [kindFilter, memos, statusFilter])

  const memoGroups = useMemo(() => {
    const groups = new Map<string, ApiMemo[]>()
    for (const memo of visibleMemos) {
      const key = memoDateKey(memoTimestamp(memo))
      groups.set(key, [...(groups.get(key) ?? []), memo])
    }
    return Array.from(groups.entries())
      .map(([dateKey, items]) => ({
        dateKey,
        label: memoDateGroupLabel(memoTimestamp(items[0])),
        items: items.sort((left, right) => new Date(memoTimestamp(left) || 0).getTime() - new Date(memoTimestamp(right) || 0).getTime()),
      }))
      .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
  }, [visibleMemos])

  const orderedVisibleMemos = useMemo(() => memoGroups.flatMap((group) => group.items), [memoGroups])

  const selectedMemo = useMemo(
    () => orderedVisibleMemos.find((memo) => memo.id === selectedMemoId) ?? orderedVisibleMemos[0],
    [orderedVisibleMemos, selectedMemoId],
  )

  useEffect(() => {
    if (!orderedVisibleMemos.length) {
      setSelectedMemoId(undefined)
      return
    }
    if (!orderedVisibleMemos.some((memo) => memo.id === selectedMemoId)) setSelectedMemoId(orderedVisibleMemos[0].id)
  }, [orderedVisibleMemos, selectedMemoId])

  const openCreate = () => {
    setEditorMode("create")
    setEditingMemo(undefined)
    setForm(emptyForm())
    setError(undefined)
    setEditorOpen(true)
  }

  const openEdit = (memo: ApiMemo) => {
    setSelectedMemoId(memo.id)
    setEditorMode("edit")
    setEditingMemo(memo)
    setForm({
      title: memo.title,
      content: memo.content ?? "",
      kind: memo.kind,
      status: memo.status,
      priority: memo.priority,
      remindAt: toDateTimeLocalInputValue(memo.remind_at),
      dueAt: toDateTimeLocalInputValue(memo.due_at),
    })
    setError(undefined)
    setEditorOpen(true)
  }

  const closeEditor = () => {
    if (saving) return
    setEditorOpen(false)
    setEditingMemo(undefined)
    setForm(emptyForm())
  }

  const handleSave = async () => {
    const cleanTitle = form.title.trim()
    if (!cleanTitle) {
      setError("标题不能为空。")
      return
    }
    if (form.kind === "reminder" && !form.remindAt && !form.dueAt) {
      setError("提醒需要设置提醒时间或截止时间。")
      return
    }

    setSaving(true)
    setError(undefined)
    try {
      const input = {
        title: cleanTitle,
        content: form.content.trim(),
        kind: form.kind,
        status: form.status,
        priority: form.priority,
        remind_at: fromDateTimeLocalInputValue(form.remindAt),
        due_at: fromDateTimeLocalInputValue(form.dueAt),
      }
      const memo =
        editorMode === "edit" && editingMemo
          ? await updateMemo(editingMemo.id, input)
          : await createMemo({ ...input, status: undefined })
      await loadMemos()
      setEditorOpen(false)
      setEditingMemo(memo)
      setForm(emptyForm())
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  const handleComplete = async (memo: ApiMemo) => {
    setSaving(true)
    setError(undefined)
    try {
      const updated = await completeMemo(memo.id)
      setMemos((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      if (editingMemo?.id === updated.id) setEditingMemo(updated)
      setEditorOpen(false)
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : String(completeError))
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async (memo: ApiMemo) => {
    setSaving(true)
    setError(undefined)
    try {
      const updated = await archiveMemo(memo.id)
      setMemos((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      if (editingMemo?.id === updated.id) setEditingMemo(updated)
      setEditorOpen(false)
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : String(archiveError))
    } finally {
      setSaving(false)
    }
  }

  const handleSnooze = async (memo: ApiMemo, minutes: number) => {
    setSaving(true)
    setError(undefined)
    try {
      const updated = await snoozeMemo(memo.id, { minutes })
      setMemos((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setEditingMemo(updated)
      setForm((current) => ({ ...current, status: updated.status, remindAt: toDateTimeLocalInputValue(updated.remind_at) }))
    } catch (snoozeError) {
      setError(snoozeError instanceof Error ? snoozeError.message : String(snoozeError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      key="memo"
      {...screenMotion}
      transition={transition}
      className="fixed inset-0 z-10 flex h-[100vh] w-[100vw] flex-col overflow-hidden bg-[#f7f5f0] bg-cover bg-center font-sans text-text"
      style={{
        backgroundImage: `linear-gradient(rgba(250,249,246,0.965), rgba(250,249,246,0.965)), url(${memoWorkspaceBackground})`,
      }}
    >
      <header className="flex h-[10.5vh] shrink-0 items-center justify-between border-b border-stone-200/55 bg-[#fbfaf7]/92 px-[2.15vw] shadow-[0_0.25vh_0.8vh_rgba(87,83,78,0.06)] backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-[1.15vw]">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[1vh] p-[1.15vh] text-text-muted transition-colors hover:bg-card/80 hover:text-text"
            aria-label="返回聊天"
            title="返回聊天"
          >
            <ArrowLeft className="h-[2.7vh] w-[2.7vh]" />
          </button>
          <div className="flex h-[5.7vh] w-[5.7vh] items-center justify-center rounded-[0.9vh] border border-stone-200/70 bg-white/72 text-stone-700 shadow-sm">
            <NotebookPen className="h-[2.7vh] w-[2.7vh]" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-[3.35vh] text-text">备忘录</h1>
            <p className="truncate text-[1.6vh] text-text-muted">
              {memos.length} 张纸条 · {reminderCount} 个提醒 · 下次 {nextMemo ? formatLocalMonthDayTime(nextMemo.trigger_at) : "-"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-[0.75vw]">
          <button
            type="button"
            onClick={() => void loadMemos()}
            className="flex items-center gap-[0.5vw] rounded-full border border-stone-200/70 bg-white/68 px-[1.15vw] py-[0.95vh] text-[1.55vh] text-text-muted shadow-sm backdrop-blur-[1px] transition-colors hover:border-stone-300 hover:text-text"
          >
            <RefreshCw className={cn("h-[1.9vh] w-[1.9vh]", loading && "animate-spin")} />
            刷新
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-[0.55vw] rounded-full border border-amber-700/20 bg-amber-600 px-[1.25vw] py-[0.95vh] text-[1.58vh] font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
          >
            <Plus className="h-[1.95vh] w-[1.95vh]" />
            新纸条
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[32.2vw_minmax(0,1fr)] gap-[1.1vw] overflow-hidden px-[2.15vw] py-[2vh]">
        <aside className="flex min-h-0 flex-col overflow-hidden">
          <button
            type="button"
            onClick={() => nextMemo && setSelectedMemoId(nextMemo.id)}
            disabled={!nextMemo}
            className="flex h-[8.4vh] shrink-0 items-center gap-[1vw] rounded-[0.55vh] border border-amber-200/55 bg-[#fff7e8]/72 px-[1.25vw] text-left text-stone-700 shadow-[0_0.18vh_0.55vh_rgba(87,83,78,0.05)] outline-none transition-colors hover:border-amber-300/70 hover:bg-[#fff4dd] focus-visible:border-amber-400/70 disabled:cursor-default"
          >
            <Bell className="h-[2.45vh] w-[2.45vh] shrink-0 text-amber-700" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[1.72vh]">
                {nextMemo ? `下一次提醒 ${memoDateKey(memoTimestamp(nextMemo))} ${memoClock(memoTimestamp(nextMemo))}` : "暂无待提醒纸条"}
              </span>
              <span className="mt-[0.35vh] block truncate text-[1.48vh] text-stone-600">{nextMemo?.title || "新建一张提醒纸条"}</span>
            </span>
            <ChevronRight className="h-[1.9vh] w-[1.9vh] shrink-0 text-stone-500" />
          </button>

          <div className="relative mt-[1.15vh] shrink-0">
            <Search className="absolute left-[1.15vw] top-1/2 h-[2.05vh] w-[2.05vh] -translate-y-1/2 text-stone-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索纸条"
              className="h-[6.1vh] w-full rounded-[0.55vh] border border-stone-200/75 bg-white/64 pl-[3.15vw] pr-[1vw] text-[1.68vh] text-text shadow-[0_0.18vh_0.45vh_rgba(87,83,78,0.04)] outline-none transition-colors placeholder:text-text-lighter focus:border-stone-400/70"
            />
          </div>

          <div className="mt-[1.5vh] grid shrink-0 grid-cols-[12vw_11vw] gap-[1vw]">
            <PaperSelect<StatusFilter> value={statusFilter} options={statusFilterOptions} onChange={setStatusFilter} />
            <PaperSelect<KindFilter> value={kindFilter} options={kindFilterOptions} onChange={setKindFilter} />
          </div>

          {error ? (
            <div className="mt-[1vh] rounded-[0.55vh] border border-stone-300 bg-white/86 px-[1vw] py-[0.8vh] text-[1.48vh] text-stone-700">{error}</div>
          ) : null}

          <section className="mt-[1.15vh] min-h-0 flex-1 overflow-y-auto border-x border-b border-stone-200/70 bg-white/22" style={{ scrollbarGutter: "stable" }}>
            {visibleMemos.length === 0 ? (
              <button
                type="button"
                onClick={openCreate}
                className="flex h-full min-h-[38vh] w-full flex-col items-center justify-center text-center text-text-muted outline-none transition-colors hover:bg-white/32"
              >
                <NotebookPen className="mb-[1.3vh] h-[4.8vh] w-[4.8vh] text-stone-400" />
                <p className="font-serif text-[2.55vh] text-text">还没有纸条</p>
                <p className="mt-[0.65vh] text-[1.5vh]">写下第一条备忘。</p>
              </button>
            ) : (
              memoGroups.map((group) => (
                <div key={group.dateKey}>
                  <div className="flex h-[5.45vh] items-center border-y border-stone-200/65 bg-white/28 px-[1vw] text-[1.62vh] text-stone-500 first:border-t-0">
                    {group.label}
                  </div>
                  {group.items.map((memo) => {
                    const selected = memo.id === selectedMemo?.id
                    const KindIcon = kindMeta[memo.kind].icon
                    return (
                      <button
                        key={memo.id}
                        type="button"
                        onClick={() => setSelectedMemoId(memo.id)}
                        onDoubleClick={() => openEdit(memo)}
                        aria-pressed={selected}
                        className={cn(
                          "relative grid h-[9.55vh] w-full grid-cols-[4.45vw_minmax(0,1fr)_auto] items-center gap-[0.7vw] border-b border-stone-200/58 px-[0.9vw] text-left outline-none transition-colors",
                          selected ? "bg-[#fff3dc]/76" : "bg-white/18 hover:bg-white/42 focus-visible:bg-white/48",
                        )}
                      >
                        <span className={cn("absolute inset-y-0 left-0 w-[0.18vw]", selected ? "bg-amber-500" : "bg-transparent")} />
                        <span className="text-[1.62vh] text-stone-600">{memoClock(memoTimestamp(memo))}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-serif text-[1.82vh] text-text">{memo.title}</span>
                          <span className="mt-[0.42vh] block truncate text-[1.35vh] text-text-muted">{memo.content || "没有正文。"}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-[0.55vw]">
                          <KindIcon className="h-[1.9vh] w-[1.9vh] text-stone-500" />
                          <span className={cn("rounded-full border px-[0.62vw] py-[0.3vh] text-[1.18vh]", statusMeta[memo.status].tone)}>
                            {statusMeta[memo.status].label}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
            {visibleMemos.length ? (
              <div className="flex h-[7vh] items-center justify-center text-[1.48vh] text-text-muted">已显示全部 {visibleMemos.length} 张纸条</div>
            ) : null}
          </section>
        </aside>

        <section className="min-h-0 overflow-hidden rounded-[0.55vh] border border-stone-200/70 bg-white/42 shadow-[0_0.2vh_0.8vh_rgba(87,83,78,0.035)]" style={paperStyle(0.94)}>
          {selectedMemo ? (
            <article className="relative h-full min-h-0 overflow-y-auto px-[2.75vw] pb-[4vh] pt-[9.2vh]" style={{ scrollbarGutter: "stable" }}>
              <button
                type="button"
                onClick={() => openEdit(selectedMemo)}
                className="absolute right-[1.9vw] top-[2.8vh] flex items-center gap-[0.45vw] rounded-[0.45vh] px-[0.55vw] py-[0.55vh] text-[1.52vh] text-text-muted outline-none transition-colors hover:bg-white/55 hover:text-text focus-visible:bg-white/65 focus-visible:text-text"
              >
                <Pencil className="h-[1.65vh] w-[1.65vh]" />
                编辑
              </button>

              <h2 className="max-w-[53vw] font-serif text-[4.45vh] leading-[1.22] tracking-[0.015em] text-[#292524]">{selectedMemo.title}</h2>
              <p className="mt-[2.5vh] max-w-[58vw] whitespace-pre-wrap text-[2.35vh] leading-[1.68] text-stone-700">
                {selectedMemo.content || "没有正文。"}
              </p>

              <div className="mt-[4.6vh] border-t border-stone-200/75 pt-[3.25vh]">
                <dl className="grid gap-[2.25vh] text-[1.85vh]">
                  <div className="grid grid-cols-[11.5vw_minmax(0,1fr)] items-center">
                    <dt className="flex items-center gap-[0.85vw] text-text-muted"><Clock3 className="h-[2.05vh] w-[2.05vh]" />提醒时间</dt>
                    <dd className="text-stone-600">{memoFullDateTime(selectedMemo.trigger_at || selectedMemo.remind_at || selectedMemo.due_at)}</dd>
                  </div>
                  <div className="grid grid-cols-[11.5vw_minmax(0,1fr)] items-center">
                    <dt className="flex items-center gap-[0.85vw] text-text-muted"><CalendarDays className="h-[2.05vh] w-[2.05vh]" />创建时间</dt>
                    <dd className="text-stone-600">{memoFullDateTime(selectedMemo.created_at)}</dd>
                  </div>
                  <div className="grid grid-cols-[11.5vw_minmax(0,1fr)] items-center">
                    <dt className="flex items-center gap-[0.85vw] text-text-muted"><Tag className="h-[2.05vh] w-[2.05vh]" />类型</dt>
                    <dd className="text-stone-600">{kindMeta[selectedMemo.kind].label}</dd>
                  </div>
                  <div className="grid grid-cols-[11.5vw_minmax(0,1fr)] items-center">
                    <dt className="flex items-center gap-[0.85vw] text-text-muted"><Archive className="h-[2.05vh] w-[2.05vh]" />状态</dt>
                    <dd className="text-stone-600">{statusMeta[selectedMemo.status].label}</dd>
                  </div>
                </dl>
              </div>
            </article>
          ) : (
            <button type="button" onClick={openCreate} className="flex h-full w-full flex-col items-center justify-center text-center text-text-muted outline-none hover:bg-white/16">
              <NotebookPen className="mb-[1.3vh] h-[5.2vh] w-[5.2vh] text-stone-400" />
              <span className="font-serif text-[2.75vh] text-text">选择或新建一张纸条</span>
              <span className="mt-[0.7vh] text-[1.55vh]">内容会在这里展开。</span>
            </button>
          )}
        </section>
      </main>

      {editorOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-stone-900/16 px-[2vw] py-[2vh] backdrop-blur-[2px]">
          <motion.section
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={transition}
            className="relative flex max-h-[84vh] w-[min(112vh,86vw)] flex-col overflow-hidden rounded-[1vh] border border-stone-200/70 shadow-[0_24px_70px_rgba(68,64,60,0.22)]"
            style={paperStyle(0.72)}
          >
            <div className="pointer-events-none absolute left-[3.2vh] top-0 h-full border-l border-stone-200/70" />
            <div className="relative z-10 flex items-center justify-between border-b border-stone-200/45 px-[3.2vh] py-[1.55vh]">
              <div className="min-w-0">
                <div className="text-[1.35vh] uppercase tracking-[0.16em] text-text-muted">
                  {editorMode === "create" ? "新纸条" : `纸条 #${editingMemo?.id ?? ""}`}
                </div>
                <div className="truncate font-serif text-[2.8vh] text-text">
                  {editorMode === "create" ? "写一张新的备忘" : "查看与编辑"}
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full border border-stone-200/60 bg-white/44 p-[0.75vh] text-text-muted shadow-sm transition-colors hover:text-text"
                aria-label="关闭"
                title="关闭"
              >
                <X className="h-[2.1vh] w-[2.1vh]" />
              </button>
            </div>

            <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_30vh] overflow-hidden">
              <div className="min-h-0 overflow-y-auto px-[3.2vh] py-[2.4vh] pr-[2.8vh]">
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="标题"
                  className="w-full border-0 bg-transparent font-serif text-[4.1vh] leading-tight text-text outline-none placeholder:text-text-lighter"
                />
                <textarea
                  value={form.content}
                  onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  placeholder="想记下什么"
                  className="mt-[2.2vh] min-h-[43vh] w-full resize-none border-0 bg-transparent font-serif text-[2.25vh] leading-[2] text-text outline-none placeholder:text-text-lighter"
                />
              </div>

              <aside className="min-h-0 overflow-y-auto border-l border-stone-200/45 bg-white/18 px-[2vh] py-[2.1vh] backdrop-blur-[1px]">
                <div className="font-serif text-[2.1vh] text-text">属性</div>
                <div className="mt-[1.5vh] grid gap-[1.15vh]">
                  <label className="grid gap-[0.45vh] text-[1.22vh] text-text-muted">
                    类型
                    <PaperSelect value={form.kind} options={kindOptions} onChange={(kind) => setForm((current) => ({ ...current, kind }))} />
                  </label>
                  <label className="grid gap-[0.45vh] text-[1.22vh] text-text-muted">
                    优先级
                    <PaperSelect
                      value={form.priority}
                      options={priorityOptions}
                      onChange={(priority) => setForm((current) => ({ ...current, priority }))}
                    />
                  </label>
                  {editorMode === "edit" && (
                    <label className="grid gap-[0.45vh] text-[1.22vh] text-text-muted">
                      状态
                      <PaperSelect value={form.status} options={statusOptions} onChange={(status) => setForm((current) => ({ ...current, status }))} />
                    </label>
                  )}
                </div>

                <div className="mt-[2.2vh] grid gap-[1.15vh]">
                  <label className="grid gap-[0.45vh] text-[1.22vh] text-text-muted">
                    提醒时间
                    <input
                      value={form.remindAt}
                      onChange={(event) => setForm((current) => ({ ...current, remindAt: event.target.value }))}
                      type="datetime-local"
                      className="h-[4.4vh] rounded-[0.65vh] border border-stone-200/65 bg-white/46 px-[1vh] text-[1.38vh] text-text outline-none focus:border-stone-400/70"
                    />
                  </label>
                  <label className="grid gap-[0.45vh] text-[1.22vh] text-text-muted">
                    截止时间
                    <input
                      value={form.dueAt}
                      onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))}
                      type="datetime-local"
                      className="h-[4.4vh] rounded-[0.65vh] border border-stone-200/65 bg-white/46 px-[1vh] text-[1.38vh] text-text outline-none focus:border-stone-400/70"
                    />
                  </label>
                </div>

                {editingMemo && (
                  <div className="mt-[2.1vh] grid gap-[0.55vh] border-t border-stone-200/45 pt-[1.25vh] text-[1.24vh] text-text-muted">
                    <span>{triggerLabel(editingMemo)}</span>
                    <span>创建 {formatLocalMonthDayTime(editingMemo.created_at)}</span>
                    <span>更新 {formatLocalMonthDayTime(editingMemo.updated_at)}</span>
                  </div>
                )}
              </aside>
            </div>

            <div className="relative z-10 flex items-center justify-between border-t border-stone-200/45 bg-white/34 px-[3.2vh] py-[1.35vh] backdrop-blur-[1px]">
              <div className="flex items-center gap-[0.8vh]">
                {editingMemo && (
                  <button
                    type="button"
                    onClick={() => void handleSnooze(editingMemo, 30)}
                    disabled={saving || editingMemo.status !== "active"}
                    className="flex items-center gap-[0.55vh] rounded-full border border-stone-200/65 bg-white/52 px-[1.25vh] py-[0.82vh] text-[1.5vh] text-text-muted shadow-sm transition-colors hover:border-stone-300 hover:text-text disabled:opacity-50"
                  >
                    <TimerReset className="h-[1.8vh] w-[1.8vh]" />
                    30 分钟后
                  </button>
                )}
                {editingMemo && (
                  <button
                    type="button"
                    onClick={() => void handleComplete(editingMemo)}
                    disabled={saving || editingMemo.status === "done" || editingMemo.status === "archived"}
                    className="flex items-center gap-[0.55vh] rounded-full border border-stone-200/65 bg-white/52 px-[1.25vh] py-[0.82vh] text-[1.5vh] text-text-muted shadow-sm transition-colors hover:border-stone-300 hover:text-text disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-[1.8vh] w-[1.8vh]" />
                    完成
                  </button>
                )}
                {editingMemo && (
                  <button
                    type="button"
                    onClick={() => void handleArchive(editingMemo)}
                    disabled={saving || editingMemo.status === "archived"}
                    className="flex items-center gap-[0.55vh] rounded-full border border-stone-200/65 bg-white/52 px-[1.25vh] py-[0.82vh] text-[1.5vh] text-text-muted shadow-sm transition-colors hover:border-stone-300 hover:text-text disabled:opacity-50"
                  >
                    <Archive className="h-[1.8vh] w-[1.8vh]" />
                    归档
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-[0.6vh] rounded-full border border-amber-700/20 bg-amber-600 px-[1.7vh] py-[0.9vh] text-[1.58vh] font-medium text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-[1.85vh] w-[1.85vh]" />
                保存
              </button>
            </div>
          </motion.section>
        </div>
      )}
    </motion.div>
  )
}
