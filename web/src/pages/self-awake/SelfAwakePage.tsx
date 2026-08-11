import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  NotebookText,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react"
import { motion } from "motion/react"
import journalWorkspaceBackground from "../../assets/self-awake/journal-workspace-bg.png"
import type { AuthUser, CoreAssistant } from "../../lib/auth"
import { getErrorMessage } from "../../lib/auth"
import {
  listSelfAwakeRunsPage,
  type ApiSelfAwakeAction,
  type ApiSelfAwakeDiary,
  type ApiSelfAwakeRun,
  type ToolStatus,
} from "../../lib/mon_agent_api"
import { formatLocalMonthDayTime, formatLocalWeekday } from "../../lib/time"

const screenMotion = {
  initial: { opacity: 0, x: 18, filter: "blur(3px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: 26, filter: "blur(3px)" },
}

const transition = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1],
} as const

interface SelfAwakePageProps {
  currentUser?: AuthUser | null
  assistant?: CoreAssistant | null
  toolStatus?: ToolStatus
  onBack: () => void
}

type StatusTone = "ok" | "warn" | "muted" | "danger"
type SelfAwakeView = "overview" | "diary"
type DiaryEntry = {
  run: ApiSelfAwakeRun
  diary: ApiSelfAwakeDiary
  timestamp: string
  dateKey: string
}
type DiaryDayGroup = {
  dateKey: string
  entries: DiaryEntry[]
  count: number
  latestTimestamp?: string
}
type DiaryMonthGroup = {
  monthKey: string
  days: DiaryDayGroup[]
  count: number
  latestTimestamp?: string
}
type DiaryYearGroup = {
  yearKey: string
  months: DiaryMonthGroup[]
  count: number
  latestTimestamp?: string
}

const statusMeta: Record<string, { label: string; tone: StatusTone }> = {
  succeeded: { label: "完成", tone: "ok" },
  failed: { label: "失败", tone: "danger" },
  running: { label: "运行中", tone: "warn" },
  pending: { label: "等待", tone: "muted" },
  skipped: { label: "跳过", tone: "muted" },
}

const actionLabels: Record<string, string> = {
  observe_only: "只观察",
  write_diary: "写日记",
  remind_user: "提醒用户",
  create_task: "创建任务",
  ask_user: "询问用户",
  run_safe_check: "安全检查",
  sync_context: "同步上下文",
  set_self_awake_timer: "设置定时器",
}

const eventLabels: Record<string, string> = {
  startup: "重启自醒",
  scheduled: "定时自醒",
  manual: "手动自醒",
  retry: "重试自醒",
}

const selfAwakePageSize = 20

function toneTextClass(tone: StatusTone) {
  if (tone === "ok") return "text-emerald-600"
  if (tone === "warn") return "text-amber-600"
  if (tone === "danger") return "text-red-600"
  return "text-text-muted"
}

function formatDateTime(value?: string | null) {
  const formatted = formatLocalMonthDayTime(value)
  return formatted === "-" ? "未记录" : formatted
}

function parseDate(value?: string | null) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function dateMillis(value?: string | null) {
  return parseDate(value)?.getTime() ?? 0
}

function pad2(value: number) {
  return String(value).padStart(2, "0")
}

function diaryTimestamp(run: ApiSelfAwakeRun, diary: ApiSelfAwakeDiary) {
  return diary.created_at ?? run.finished_at ?? run.created_at ?? run.started_at ?? ""
}

function diaryDateKey(value?: string | null) {
  const date = parseDate(value)
  if (!date) return "unknown"
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function diaryYearKey(dateKey?: string) {
  if (!dateKey || dateKey === "unknown") return "unknown"
  return dateKey.slice(0, 4)
}

function diaryMonthKey(dateKey?: string) {
  if (!dateKey || dateKey === "unknown") return "unknown"
  return dateKey.slice(0, 7)
}

function diaryYearTitle(yearKey?: string) {
  if (!yearKey || yearKey === "unknown") return "未记录年份"
  return `${yearKey} 年`
}

function diaryMonthTitle(monthKey?: string) {
  if (!monthKey || monthKey === "unknown") return "未记录月份"
  const [, month] = monthKey.split("-")
  return `${month} 月`
}

function diaryDateTitle(dateKey?: string) {
  if (!dateKey || dateKey === "unknown") return "未记录日期"
  const [year, month, day] = dateKey.split("-")
  return `${year}年${month}月${day}日`
}

function diaryMonthDay(dateKey?: string) {
  if (!dateKey || dateKey === "unknown") return { month: "--", day: "--" }
  const [, month, day] = dateKey.split("-")
  return { month: `${month}月`, day: day ?? "--" }
}

function diaryWeekday(dateKey?: string) {
  if (!dateKey || dateKey === "unknown") return ""
  const date = parseDate(`${dateKey}T00:00:00`)
  if (!date) return ""
  return formatLocalWeekday(date)
}

function diaryDateStamp(value?: string | null) {
  const key = diaryDateKey(value)
  return {
    key,
    title: diaryDateTitle(key),
    weekday: diaryWeekday(key),
    ...diaryMonthDay(key),
  }
}

function ensureExpanded(list: string[], value?: string) {
  if (!value || list.includes(value)) return list
  return [...list, value]
}

function toggleExpanded(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function mergeRuns(existing: ApiSelfAwakeRun[], incoming: ApiSelfAwakeRun[]) {
  const seen = new Set(existing.map((run) => run.id))
  return [...existing, ...incoming.filter((run) => !seen.has(run.id))]
}

function formatMinutes(minutes?: number | null) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "未安排"
  if (minutes < 60) return `${minutes} 分钟后`
  const hours = minutes / 60
  if (Number.isInteger(hours)) return `${hours} 小时后`
  return `${hours.toFixed(1)} 小时后`
}

function trimText(value?: string | null, fallback = "未记录") {
  const text = value?.trim()
  return text || fallback
}

function formatDisplayTitle(value?: string | null) {
  return trimText(value, "一次自醒").replace(/\s*·\s*/g, " · ")
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function formatFact(value: unknown, fallback = "未记录") {
  if (value === true) return "是"
  if (value === false) return "否"
  if (value === null || value === undefined || value === "") return fallback
  return String(value)
}

function formatClock(value?: string | null) {
  const date = parseDate(value)
  if (!date) return "--:--"
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function formatDateGroup(value?: string | null) {
  const date = parseDate(value)
  if (!date) return "未记录日期"
  return `${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日`
}

function relativeDateGroup(value?: string | null) {
  const date = parseDate(value)
  if (!date) return "未记录日期"
  const today = new Date()
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const difference = Math.round((todayStart - dateStart) / 86_400_000)
  if (difference === 0) return "今天"
  if (difference === 1) return "昨天"
  return formatDateGroup(value)
}

function resolveDiary(run?: ApiSelfAwakeRun) {
  return run?.diaries?.find((diary) => diary.visible_to_user) ?? run?.diaries?.[0]
}

function resolveAction(run?: ApiSelfAwakeRun): ApiSelfAwakeAction | undefined {
  return run?.actions?.[0]
}

function runAuthorName(run?: ApiSelfAwakeRun, fallback = "未知角色") {
  return run?.author?.character_name || run?.author?.assistant_name || fallback
}

export function SelfAwakePage({ currentUser, onBack }: SelfAwakePageProps) {
  const [runs, setRuns] = useState<ApiSelfAwakeRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | undefined>()
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRuns, setTotalRuns] = useState(0)
  const [activeView, setActiveView] = useState<SelfAwakeView>("overview")
  const [expandedDiaryYears, setExpandedDiaryYears] = useState<string[]>([])
  const [expandedDiaryMonths, setExpandedDiaryMonths] = useState<string[]>([])
  const [expandedDiaryDates, setExpandedDiaryDates] = useState<string[]>([])
  const [expandedDiaryEntryDates, setExpandedDiaryEntryDates] = useState<string[]>([])
  const [diarySearch, setDiarySearch] = useState("")
  const [rawDataExpanded, setRawDataExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const searchQuery = diarySearch.trim()

  const loadRuns = useCallback(async (page = 1, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(undefined)
    try {
      const pageData = await listSelfAwakeRunsPage({ page, pageSize: selfAwakePageSize, q: searchQuery })
      setCurrentPage(pageData.current_page)
      setTotalPages(pageData.total_pages)
      setTotalRuns(pageData.count)
      setRuns((currentRuns) => {
        const nextRuns = append ? mergeRuns(currentRuns, pageData.results) : pageData.results
        setSelectedRunId((current) => {
          if (current && nextRuns.some((run) => run.id === current)) return current
          return nextRuns[0]?.id
        })
        return nextRuns
      })
    } catch (loadError) {
      setError(getErrorMessage(loadError, "读取自醒记录失败。"))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [searchQuery])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  const selectedRun = useMemo(() => runs.find((run) => run.id === selectedRunId) ?? runs[0], [runs, selectedRunId])
  const hasMoreRuns = currentPage < totalPages
  const selectedDiary = resolveDiary(selectedRun)
  const selectedAction = resolveAction(selectedRun)
  const selectedAuthorName = runAuthorName(selectedRun)
  const normalizedDiarySearch = searchQuery.toLowerCase()
  const overviewRuns = runs
  const overviewRunGroups = useMemo(() => {
    const groups = new Map<string, ApiSelfAwakeRun[]>()
    for (const run of overviewRuns) {
      const timestamp = run.finished_at ?? run.created_at ?? run.started_at
      const dateKey = diaryDateKey(timestamp)
      groups.set(dateKey, [...(groups.get(dateKey) ?? []), run])
    }
    return Array.from(groups.entries()).map(([dateKey, groupRuns]) => ({
      dateKey,
      label: relativeDateGroup(groupRuns[0]?.finished_at ?? groupRuns[0]?.created_at ?? groupRuns[0]?.started_at),
      runs: groupRuns,
    }))
  }, [overviewRuns])
  const selectedContext = asRecord(selectedRun?.context_payload)
  const selectedActivity = asRecord(selectedContext.user_activity)
  const selectedSystemInput = asRecord(selectedActivity.system_input)
  const selectedSession = asRecord(selectedActivity.session)
  const selectedForeground = asRecord(selectedActivity.foreground_window)
  const selectedStatus = statusMeta[selectedRun?.status || ""] ?? { label: selectedRun?.status || "未知", tone: "muted" as const }
  const allDiaryEntries = useMemo(
    () =>
      runs
        .flatMap((run) =>
          (run.diaries ?? [])
            .filter((diary) => diary.visible_to_user)
            .map((diary) => {
              const timestamp = diaryTimestamp(run, diary)
              return {
                run,
                diary,
                timestamp,
                dateKey: diaryDateKey(timestamp),
              }
            }),
        )
        .sort((left, right) => dateMillis(right.timestamp) - dateMillis(left.timestamp)),
    [runs],
  )
  const diaryEntries = allDiaryEntries
  const diaryGroups = useMemo(() => {
    const groups = new Map<string, DiaryEntry[]>()
    for (const entry of diaryEntries) {
      groups.set(entry.dateKey, [...(groups.get(entry.dateKey) ?? []), entry])
    }
    return Array.from(groups.entries())
      .map(([dateKey, entries]) => ({
        dateKey,
        entries,
        count: entries.length,
        latestTimestamp: entries[0]?.timestamp,
      }))
      .sort((left, right) => dateMillis(right.latestTimestamp) - dateMillis(left.latestTimestamp))
  }, [diaryEntries])
  const diaryYears = useMemo<DiaryYearGroup[]>(() => {
    const yearMap = new Map<string, Map<string, DiaryDayGroup[]>>()

    for (const day of diaryGroups) {
      const yearKey = diaryYearKey(day.dateKey)
      const monthKey = diaryMonthKey(day.dateKey)
      const monthMap = yearMap.get(yearKey) ?? new Map<string, DiaryDayGroup[]>()
      monthMap.set(monthKey, [...(monthMap.get(monthKey) ?? []), day])
      yearMap.set(yearKey, monthMap)
    }

    return Array.from(yearMap.entries())
      .map(([yearKey, monthMap]) => {
        const months = Array.from(monthMap.entries())
          .map(([monthKey, days]) => ({
            monthKey,
            days,
            count: days.reduce((sum, day) => sum + day.count, 0),
            latestTimestamp: days[0]?.latestTimestamp,
          }))
          .sort((left, right) => dateMillis(right.latestTimestamp) - dateMillis(left.latestTimestamp))

        return {
          yearKey,
          months,
          count: months.reduce((sum, month) => sum + month.count, 0),
          latestTimestamp: months[0]?.latestTimestamp,
        }
      })
      .sort((left, right) => dateMillis(right.latestTimestamp) - dateMillis(left.latestTimestamp))
  }, [diaryGroups])

  const openDiaryPath = useCallback((dateKey?: string) => {
    if (!dateKey || dateKey === "unknown") return
    setExpandedDiaryYears((current) => ensureExpanded(current, diaryYearKey(dateKey)))
    setExpandedDiaryMonths((current) => ensureExpanded(current, diaryMonthKey(dateKey)))
    setExpandedDiaryDates((current) => ensureExpanded(current, dateKey))
  }, [])

  useEffect(() => {
    if (activeView !== "overview" || !overviewRuns.length) return
    if (!overviewRuns.some((run) => run.id === selectedRunId)) setSelectedRunId(overviewRuns[0].id)
  }, [activeView, overviewRuns, selectedRunId])

  useEffect(() => {
    setRawDataExpanded(false)
  }, [selectedRunId])

  useEffect(() => {
    if (!diaryGroups.length) {
      setExpandedDiaryYears([])
      setExpandedDiaryMonths([])
      setExpandedDiaryDates([])
      setExpandedDiaryEntryDates([])
      return
    }
    const latestDate = diaryGroups[0]?.dateKey
    const latestYear = diaryYearKey(latestDate)
    const latestMonth = diaryMonthKey(latestDate)
    const validYears = new Set(diaryYears.map((year) => year.yearKey))
    const validMonths = new Set(diaryYears.flatMap((year) => year.months.map((month) => month.monthKey)))
    const validDates = new Set(diaryGroups.map((group) => group.dateKey))

    setExpandedDiaryYears((current) => {
      const next = current.filter((item) => validYears.has(item))
      return next.length ? next : latestYear === "unknown" ? next : [latestYear]
    })
    setExpandedDiaryMonths((current) => {
      const next = current.filter((item) => validMonths.has(item))
      return next.length ? next : latestMonth === "unknown" ? next : [latestMonth]
    })
    setExpandedDiaryDates((current) => {
      const next = current.filter((item) => validDates.has(item))
      return next.length ? next : latestDate && latestDate !== "unknown" ? [latestDate] : next
    })
    setExpandedDiaryEntryDates((current) => current.filter((item) => validDates.has(item)))
  }, [diaryGroups])

  useEffect(() => {
    if (!selectedDiary || activeView !== "diary") return
    const key = diaryDateKey(selectedDiary.created_at ?? selectedRun?.finished_at)
    if (key !== "unknown") {
      openDiaryPath(key)
    }
  }, [activeView, openDiaryPath, selectedDiary, selectedRun?.finished_at])

  return (
    <motion.div
      key="self-awake"
      {...screenMotion}
      transition={transition}
      className="fixed inset-0 z-10 flex h-[100vh] w-[100vw] flex-col overflow-hidden bg-bg bg-cover bg-center font-sans text-text"
      style={{
        backgroundImage: `linear-gradient(rgba(250, 250, 249, 0.88), rgba(250, 250, 249, 0.88)), url(${journalWorkspaceBackground})`,
      }}
    >
      <header className="flex h-[9.2vh] shrink-0 items-center justify-between border-b border-white/45 bg-bg/76 px-[3vw] shadow-sm backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-[1.2vw]">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[1vh] p-[1.15vh] text-text-muted transition-colors hover:bg-card hover:text-text"
            aria-label="返回聊天"
            title="返回聊天"
          >
            <ArrowLeft className="h-[2.7vh] w-[2.7vh]" />
          </button>
          <div className="flex h-[5.1vh] w-[5.1vh] items-center justify-center rounded-[0.9vh] border border-accent/25 bg-card text-accent shadow-sm">
            <Sparkles className="h-[2.45vh] w-[2.45vh]" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-[2.8vh] text-text">自醒</h1>
            <p className="truncate text-[1.7vh] text-text-muted">后台观察、工作日记、下次醒来。</p>
          </div>
        </div>
        <div className="flex items-center gap-[0.8vw]">
          <div className="flex overflow-hidden rounded-[0.75vh] border border-border bg-card shadow-sm">
            {[
              { key: "overview" as const, label: "概览" },
              { key: "diary" as const, label: "日记" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setActiveView(item.key)
                  if (item.key === "overview" && diarySearch) setDiarySearch("")
                }}
                className={`border-b-[0.22vh] px-[2vw] py-[1vh] text-[1.76vh] transition-colors ${
                  activeView === item.key ? "border-accent bg-bg/60 text-accent" : "border-transparent text-text-muted hover:bg-bg hover:text-accent"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void loadRuns()}
            className="flex items-center gap-[0.5vw] rounded-[0.75vh] border border-border bg-card px-[1.1vw] py-[1vh] text-[1.72vh] text-text-muted shadow-sm transition-colors hover:border-accent/35 hover:text-accent"
            title="刷新自醒记录"
          >
            <RefreshCw className={`h-[1.9vh] w-[1.9vh] ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
          <div className="flex items-center gap-[0.45vw] rounded-[0.75vh] border border-border bg-card px-[1.2vw] py-[1vh] text-[1.72vh] text-text-muted shadow-sm">
            <UserRound className="h-[1.65vh] w-[1.65vh]" />
            {currentUser?.username ?? "未登录"}
          </div>
        </div>
      </header>

      {activeView === "overview" ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-[2.4vw] pb-[2.1vh] pt-[1.8vh]">
          <div className="grid min-h-0 flex-1 grid-cols-[24.3vw_minmax(0,1fr)] gap-[1.25vw]">
            <aside className="flex min-h-0 flex-col overflow-hidden rounded-[0.8vh] border border-border/90 bg-card/94 shadow-[0_0.35vh_1.4vh_rgba(41,37,36,0.06)]">
              <div className="flex h-[6.2vh] shrink-0 items-center border-b border-border px-[1.35vw] font-serif text-[2.15vh] text-text">近期自醒</div>
              <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
                {error ? (
                  <div className="m-[1vw] flex items-start gap-[0.65vw] rounded-[0.7vh] border border-red-200 bg-red-50 p-[1vh] text-[1.55vh] text-red-700">
                    <AlertCircle className="mt-[0.1vh] h-[1.7vh] w-[1.7vh] shrink-0" />
                    {error}
                  </div>
                ) : null}
                {!loading && !error && overviewRunGroups.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-[2vw] text-center text-text-muted">
                    <Activity className="mb-[1vh] h-[3.4vh] w-[3.4vh] text-accent/65" />
                    <div className="font-serif text-[2vh] text-text">还没有自醒记录</div>
                  </div>
                ) : null}
                {overviewRunGroups.map((group) => (
                  <div key={group.dateKey}>
                    <div className="flex h-[4.5vh] items-center border-b border-border bg-bg/45 px-[1.35vw] text-[1.55vh] text-text-muted">{group.label}</div>
                    {group.runs.slice(0, 5).map((run) => {
                      const diary = resolveDiary(run)
                      const selected = run.id === selectedRun?.id
                      return (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() => setSelectedRunId(run.id)}
                          className={`relative flex min-h-[8.2vh] w-full flex-col justify-center border-b border-border px-[1.35vw] text-left transition-colors ${selected ? "bg-accent-dim/55" : "bg-card hover:bg-bg/70"}`}
                        >
                          {selected ? <span className="absolute left-[1.25vw] top-1/2 h-[0.75vh] w-[0.75vh] -translate-y-1/2 rounded-full bg-accent" /> : null}
                          <div className={`flex min-w-0 items-center justify-between gap-[0.8vw] ${selected ? "pl-[1.3vw]" : ""}`}>
                            <span className={`truncate font-serif text-[1.78vh] ${selected ? "text-accent" : "text-text"}`}>{formatDisplayTitle(diary?.title)}</span>
                            <span className="shrink-0 text-[1.42vh] text-text-muted">{formatClock(run.finished_at ?? run.created_at ?? run.started_at)}</span>
                          </div>
                          <div className={`mt-[0.7vh] truncate text-[1.38vh] text-text-muted ${selected ? "pl-[1.3vw]" : ""}`}>
                            {runAuthorName(run)} · {eventLabels[run.event_type] || run.event_type} · {run.event_reason || "未记录原因"}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
              {!loading && !error && hasMoreRuns ? (
                <button
                  type="button"
                  onClick={() => void loadRuns(currentPage + 1, true)}
                  disabled={loadingMore}
                  className="flex h-[5.4vh] shrink-0 items-center justify-center gap-[0.45vw] border-t border-border text-[1.48vh] text-text transition-colors hover:bg-bg hover:text-accent disabled:cursor-wait disabled:opacity-60"
                >
                  {loadingMore ? <RefreshCw className="h-[1.55vh] w-[1.55vh] animate-spin" /> : null}
                  {loadingMore ? "正在加载" : "查看更多"}
                  {!loadingMore ? <ChevronDown className="h-[1.55vh] w-[1.55vh]" /> : null}
                </button>
              ) : null}
            </aside>

            <section className="min-h-0 overflow-hidden rounded-[0.8vh] border border-border/90 bg-card/95 shadow-[0_0.35vh_1.4vh_rgba(41,37,36,0.06)]">
              {selectedRun ? (
                <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.33fr)_minmax(22vw,0.9fr)]">
                  <article className="flex min-h-0 flex-col overflow-hidden px-[2.2vw] py-[2.6vh]">
                    <h2 className="truncate font-serif text-[3vh] leading-tight text-text">{formatDisplayTitle(selectedDiary?.title)}</h2>
                    <div className="mt-[1vh] flex items-center gap-[0.5vw] text-[1.52vh] text-text-muted">
                      <UserRound className="h-[1.75vh] w-[1.75vh]" />
                      <span>{selectedAuthorName}</span>
                    </div>

                    <div className="mt-[2.4vh] flex min-h-0 flex-1 flex-col">
                      <h3 className="border-l-[0.22vw] border-accent pl-[0.8vw] font-serif text-[2.08vh] text-text">工作日记</h3>
                      <div className="mt-[1.8vh] min-h-0 flex-1 overflow-y-auto pr-[0.8vw]" style={{ scrollbarGutter: "stable" }}>
                        <p className="whitespace-pre-wrap font-serif text-[1.75vh] leading-[2.05] text-text">
                          {trimText(selectedDiary?.content, "没有写入工作日记。")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-[1.6vh] flex h-[5.4vh] shrink-0 items-center gap-[0.65vw] border-t border-border text-[1.46vh] text-text-muted">
                      <NotebookText className="h-[1.65vh] w-[1.65vh]" />
                      <span>{actionLabels[selectedAction?.action_type || ""] || selectedAction?.action_type || "未记录动作"}</span>
                      <span>·</span>
                      <span className={toneTextClass(selectedAction?.status === "failed" ? "danger" : selectedAction?.status === "succeeded" ? "ok" : "muted")}>{selectedAction?.status || "未执行"}</span>
                    </div>
                  </article>

                  <aside className="min-h-0 overflow-y-auto border-l border-border px-[1.65vw] py-[2.8vh]" style={{ scrollbarGutter: "stable" }}>
                    <section>
                      <h3 className="border-l-[0.22vw] border-accent pl-[0.75vw] font-serif text-[2.55vh] text-text">本轮判断</h3>
                      <dl className="mt-[2vh] space-y-[1.45vh] text-[1.95vh] leading-relaxed">
                        <div className="grid grid-cols-[6.4vw_minmax(0,1fr)] gap-[0.6vw]"><dt className="text-text-muted">状态</dt><dd>{trimText(selectedRun.mood, "平稳")}</dd></div>
                        <div className="grid grid-cols-[6.4vw_minmax(0,1fr)] gap-[0.6vw]"><dt className="text-text-muted">当前想法</dt><dd>{trimText(selectedRun.current_desire, "没有留下明确想法。")}</dd></div>
                        <div className="grid grid-cols-[6.4vw_minmax(0,1fr)] gap-[0.6vw]"><dt className="text-text-muted">行动摘要</dt><dd>{trimText(selectedAction?.message || selectedDiary?.summary || selectedRun.current_desire, "完成本轮观察。")}</dd></div>
                      </dl>
                    </section>

                    <section className="mt-[2.4vh] border-t border-border pt-[2.1vh]">
                      <h3 className="border-l-[0.22vw] border-accent pl-[0.75vw] font-serif text-[2.55vh] text-text">观察事实</h3>
                      <dl className="mt-[1.8vh] space-y-[0.92vh] text-[1.9vh] leading-relaxed">
                        {[
                          ["触发", eventLabels[selectedRun.event_type] || selectedRun.event_type],
                          ["来源", selectedRun.event_source || selectedRun.source_service],
                          ["原因", selectedRun.event_reason],
                          ["系统空闲", selectedSystemInput.idle_seconds !== undefined ? `${formatFact(selectedSystemInput.idle_seconds)} 秒` : "未采集"],
                          ["屏幕锁定", selectedSession.locked === true ? "是" : selectedSession.locked === false ? "否" : "未采集"],
                          ["前台应用", formatFact(selectedForeground.application_name, "未采集")],
                          ["文档/窗口", formatFact(selectedForeground.window_title, "未采集")],
                          ["捕获时间", typeof selectedActivity.captured_at === "string" ? formatClock(selectedActivity.captured_at) : "未记录"],
                        ].map(([label, value]) => (
                          <div key={label} className="grid grid-cols-[6.4vw_minmax(0,1fr)] gap-[0.6vw]"><dt className="text-text-muted">{label}</dt><dd className="truncate" title={String(value)}>{value || "未记录"}</dd></div>
                        ))}
                      </dl>
                    </section>

                    <section className="mt-[2.4vh] border-t border-border pt-[2.1vh]">
                      <h3 className="border-l-[0.22vw] border-accent pl-[0.75vw] font-serif text-[2.55vh] text-text">后续</h3>
                      <dl className="mt-[1.8vh] space-y-[1.1vh] text-[1.9vh] leading-relaxed">
                        <div className="grid grid-cols-[6.4vw_minmax(0,1fr)] gap-[0.6vw]"><dt className="text-text-muted">下次醒来</dt><dd>{formatDateTime(selectedRun.next_wake_at)}</dd></div>
                        <div className="grid grid-cols-[6.4vw_minmax(0,1fr)] gap-[0.6vw]"><dt className="text-text-muted">间隔估计</dt><dd>{formatMinutes(selectedRun.next_wake_after_minutes)}</dd></div>
                        <div className="grid grid-cols-[6.4vw_minmax(0,1fr)] gap-[0.6vw]"><dt className="text-text-muted">原因说明</dt><dd>{trimText(selectedRun.next_wake_reason, "没有记录原因。")}</dd></div>
                      </dl>
                    </section>

                    {selectedRun.error || selectedAction?.error ? (
                      <div className="mt-[1.8vh] rounded-[0.6vh] border border-red-200 bg-red-50 p-[0.85vh] text-[1.4vh] text-red-700">{selectedRun.error || selectedAction?.error}</div>
                    ) : null}

                    <div className="mt-[2.2vh] border-t border-border pt-[1.7vh]">
                      <button
                        type="button"
                        onClick={() => setRawDataExpanded((current) => !current)}
                        className="flex items-center gap-[0.45vw] text-[1.85vh] text-text-muted transition-colors hover:text-accent"
                      >
                        {rawDataExpanded ? "收起原始数据" : "查看原始数据"}
                        {rawDataExpanded ? <ChevronUp className="h-[1.55vh] w-[1.55vh]" /> : <ArrowRight className="h-[1.55vh] w-[1.55vh]" />}
                      </button>
                      {rawDataExpanded ? (
                        <pre className="mt-[1vh] max-h-[20vh] overflow-auto rounded-[0.6vh] bg-bg p-[0.85vh] text-[1.18vh] leading-relaxed text-text-muted">{JSON.stringify(selectedRun, null, 2)}</pre>
                      ) : null}
                    </div>
                  </aside>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-text-muted">
                  <NotebookText className="mb-[1.2vh] h-[4.6vh] w-[4.6vh] text-accent/70" />
                  <div className="font-serif text-[2.6vh] text-text">等待第一次自醒</div>
                  <div className="mt-[0.7vh] text-[1.75vh]">这里会显示她后台醒来后的观察报告。</div>
                </div>
              )}
            </section>
          </div>
        </main>
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-[31.8vw_minmax(0,1fr)] overflow-hidden bg-[#fbfaf7]">
          <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[#ded8cf] bg-[rgba(255,255,255,0.82)]">
            <div className="flex shrink-0 items-baseline gap-[0.85vw] px-[3vw] pb-[1.8vh] pt-[2.7vh]">
              <div className="shrink-0 font-serif text-[2.5vh] text-text">手帐目录</div>
              <div className="min-w-0 truncate text-[1.75vh] text-text-muted">
                {loading
                  ? "正在读取"
                  : normalizedDiarySearch
                    ? `匹配 ${totalRuns} 篇 · 已加载 ${diaryEntries.length} 篇`
                    : totalRuns
                      ? `${diaryYears.length} 年 · ${diaryGroups.length} 天 · ${diaryEntries.length} / ${totalRuns} 篇`
                      : `${diaryYears.length} 年 · ${diaryGroups.length} 天 · ${diaryEntries.length} 篇`}
              </div>
            </div>

            <div className="mx-[2.55vw] mb-[1.6vh] flex h-[4.45vh] shrink-0 items-center gap-[0.72vw] rounded-[0.7vh] border border-[#ddd5c9] bg-white/86 px-[0.88vw] shadow-[0_0.18vh_0.55vh_rgba(65,54,42,0.10)] focus-within:border-accent/55 focus-within:ring-2 focus-within:ring-accent/10">
              <Search className="h-[1.8vh] w-[1.8vh] shrink-0 text-accent" />
              <input
                value={diarySearch}
                onChange={(event) => setDiarySearch(event.target.value)}
                placeholder="搜索标题、正文或日期"
                className="min-w-0 flex-1 bg-transparent text-[1.55vh] text-text outline-none placeholder:text-text-muted/75"
              />
              {diarySearch ? (
                <button
                  type="button"
                  onClick={() => setDiarySearch("")}
                  className="rounded-full p-[0.28vh] text-text-muted transition-colors hover:bg-accent-dim hover:text-accent"
                  aria-label="清空搜索"
                  title="清空搜索"
                >
                  <X className="h-[1.65vh] w-[1.65vh]" />
                </button>
              ) : (
                <CalendarDays className="h-[1.72vh] w-[1.72vh] shrink-0 text-text-muted" />
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#e5dfd6] pb-[2vh]" style={{ scrollbarGutter: "stable" }}>
              {error ? (
                <div className="m-[1.2vw] rounded-[0.7vh] border border-red-200 bg-red-50 p-[1.2vh] text-[1.6vh] leading-relaxed text-red-700">{error}</div>
              ) : null}
              {!loading && !error && allDiaryEntries.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-[3vw] text-center text-text-muted">
                  <NotebookText className="mb-[1.2vh] h-[4vh] w-[4vh] text-accent/70" />
                  <div className="font-serif text-[2.3vh] text-text">还没有日记</div>
                  <div className="mt-[0.8vh] text-[1.6vh] leading-relaxed">自醒完成并写入工作日记后，会出现在这里。</div>
                </div>
              ) : null}
              {!loading && !error && allDiaryEntries.length > 0 && diaryEntries.length === 0 ? (
                <div className="mx-[2.55vw] mt-[2vh] border-y border-dashed border-[#ddd2c1] py-[2vh] text-center">
                  <Search className="mx-auto mb-[0.9vh] h-[3.1vh] w-[3.1vh] text-accent/70" />
                  <div className="font-serif text-[2vh] text-text">没有找到日记</div>
                  <div className="mt-[0.5vh] text-[1.45vh] text-text-muted">换个关键词试试。</div>
                </div>
              ) : null}

              {diaryYears.map((year) => {
                const yearExpanded = expandedDiaryYears.includes(year.yearKey)
                return (
                  <div key={year.yearKey}>
                    <button
                      type="button"
                      onClick={() => setExpandedDiaryYears((current) => toggleExpanded(current, year.yearKey))}
                      className="flex h-[5.6vh] w-full items-center gap-[0.7vw] px-[3vw] text-left outline-none transition-colors hover:bg-[#fff9ef] focus-visible:bg-[#fff8ec] focus-visible:text-accent"
                    >
                      <span className="min-w-0 flex-1 truncate font-serif text-[2.55vh] text-text">{diaryYearTitle(year.yearKey)}</span>
                      <span className="text-[1.7vh] text-text-muted">{year.count} 篇</span>
                      <ChevronDown className={`h-[2vh] w-[2vh] text-text-muted transition-transform ${yearExpanded ? "" : "-rotate-90"}`} />
                    </button>

                    {yearExpanded ? year.months.map((month) => {
                      const monthExpanded = expandedDiaryMonths.includes(month.monthKey)
                      return (
                        <div key={month.monthKey}>
                          <button
                            type="button"
                            onClick={() => setExpandedDiaryMonths((current) => toggleExpanded(current, month.monthKey))}
                            className="flex h-[5.1vh] w-full items-center gap-[0.7vw] pl-[3.8vw] pr-[3vw] text-left outline-none transition-colors hover:bg-[#fff9ef] focus-visible:bg-[#fff8ec] focus-visible:text-accent"
                          >
                            <span className="min-w-0 flex-1 truncate font-serif text-[2.38vh] text-text">{diaryMonthTitle(month.monthKey)}</span>
                            <span className="text-[1.68vh] text-text-muted">{month.count} 篇</span>
                            <ChevronDown className={`h-[1.95vh] w-[1.95vh] text-text-muted transition-transform ${monthExpanded ? "" : "-rotate-90"}`} />
                          </button>

                          {monthExpanded ? month.days.map((day) => {
                            const dayExpanded = expandedDiaryDates.includes(day.dateKey)
                            const allDayEntriesExpanded = expandedDiaryEntryDates.includes(day.dateKey)
                            const visibleDayEntries = allDayEntriesExpanded ? day.entries : day.entries.slice(0, 3)
                            return (
                              <div key={day.dateKey} className="pl-[4.6vw] pr-[3vw]">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedDiaryDates((current) => toggleExpanded(current, day.dateKey))
                                    if (!dayExpanded) setSelectedRunId(day.entries[0]?.run.id)
                                  }}
                                  className="flex h-[4.75vh] w-full items-center gap-[0.75vw] border-b border-[#e7dfd3] text-left outline-none transition-colors hover:text-accent focus-visible:bg-[#fff8ec] focus-visible:text-accent"
                                >
                                  <span className="font-serif text-[2.08vh] text-text">{diaryMonthDay(day.dateKey).month}{diaryMonthDay(day.dateKey).day}日</span>
                                  <span className="min-w-0 flex-1 text-[1.7vh] text-text-muted">{diaryWeekday(day.dateKey)}</span>
                                  <span className="text-[1.66vh] text-text-muted">{day.count} 篇</span>
                                </button>

                                {dayExpanded ? (
                                  <div className="py-[0.55vh]">
                                    {visibleDayEntries.map(({ run, diary, timestamp }) => {
                                      const selected = run.id === selectedRun?.id && diary.id === selectedDiary?.id
                                      return (
                                        <button
                                          key={`${run.id}-${diary.id}`}
                                          type="button"
                                          onClick={() => {
                                            openDiaryPath(day.dateKey)
                                            setSelectedRunId(run.id)
                                          }}
                                          className={`flex h-[4.05vh] w-full items-center gap-[0.75vw] rounded-[0.45vh] px-[1.15vw] text-left transition-colors ${
                                            selected
                                              ? "bg-[#fff0d6] text-text shadow-[0_0.12vh_0.38vh_rgba(217,119,6,0.16)]"
                                              : "text-text hover:bg-[#fff8ec]"
                                          } outline-none focus-visible:bg-[#fff0d6]`}
                                        >
                                          <span className={`h-[0.72vh] w-[0.72vh] shrink-0 rounded-full ${selected ? "bg-accent" : "bg-transparent"}`} />
                                          <span className={`w-[3.5vw] shrink-0 text-[1.62vh] ${selected ? "text-accent" : "text-text-muted"}`}>{formatClock(timestamp)}</span>
                                          <span className="min-w-0 flex-1 truncate font-serif text-[1.92vh]">{diary.title || "一次自醒"}</span>
                                          <span className="max-w-[7vw] shrink-0 truncate text-[1.5vh] text-text-muted">{runAuthorName(run)}</span>
                                        </button>
                                      )
                                    })}
                                    {day.entries.length > 3 ? (
                                      <button
                                        type="button"
                                        onClick={() => setExpandedDiaryEntryDates((current) => toggleExpanded(current, day.dateKey))}
                                        className="flex h-[3.55vh] w-full items-center gap-[0.45vw] px-[1.15vw] text-left text-[1.62vh] text-text-muted outline-none transition-colors hover:bg-[#fff8ec] hover:text-accent focus-visible:bg-[#fff8ec] focus-visible:text-accent"
                                        aria-expanded={allDayEntriesExpanded}
                                      >
                                        <span className="font-serif text-[1.84vh] tracking-[0.12em]">{allDayEntriesExpanded ? "收起" : "…"}</span>
                                        <span>{allDayEntriesExpanded ? "仅显示最新 3 篇" : `展开其余 ${day.entries.length - 3} 篇`}</span>
                                        <ChevronDown className={`ml-auto h-[1.5vh] w-[1.5vh] transition-transform ${allDayEntriesExpanded ? "rotate-180" : ""}`} />
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            )
                          }) : null}
                        </div>
                      )
                    }) : null}
                  </div>
                )
              })}

              {!loading && !error && hasMoreRuns ? (
                <button
                  type="button"
                  onClick={() => void loadRuns(currentPage + 1, true)}
                  disabled={loadingMore}
                  className="mx-[3vw] mt-[1vh] flex h-[4.15vh] w-[calc(100%_-_6vw)] items-center justify-center gap-[0.55vw] border-y border-dashed border-[#ddd2c1] text-[1.62vh] text-text-muted transition-colors hover:text-accent disabled:cursor-wait disabled:opacity-60"
                >
                  <RefreshCw className={`h-[1.55vh] w-[1.55vh] ${loadingMore ? "animate-spin" : ""}`} />
                  {loadingMore ? "正在加载" : "加载更多"}
                </button>
              ) : null}
            </div>
          </aside>

          <section
            className="min-h-0 overflow-hidden bg-[#fbf8f0]"
            style={{
              backgroundImage: `linear-gradient(rgba(255, 253, 248, 0.84), rgba(255, 253, 248, 0.84)), url(${journalWorkspaceBackground})`,
              backgroundPosition: "center",
              backgroundSize: "145% auto",
            }}
          >
            {selectedRun && selectedDiary ? (
              <article className="relative grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] px-[3.1vw] pb-[3.2vh] pt-[4.8vh]">
                <div className="pointer-events-none absolute right-[3.4vw] top-[5.4vh] rounded-full bg-emerald-100/85 px-[1vw] py-[0.62vh] text-[1.55vh] text-emerald-600">
                  {selectedStatus.label}
                </div>

                <header className="flex items-start gap-[1.8vw] border-b border-dashed border-[#d8cdbb] pb-[3.2vh] pr-[7vw]">
                  <div className="relative flex h-[10.6vh] w-[4.1vw] shrink-0 flex-col items-center justify-center rounded-[0.85vh] border border-[#e4dbcd] bg-white/78 font-serif shadow-[0_0.42vh_0.75vh_rgba(63,51,38,0.12)]">
                    <span className="text-[1.38vh] text-text-muted">{diaryDateStamp(selectedDiary.created_at ?? selectedRun.finished_at).month}</span>
                    <span className="mt-[0.3vh] text-[3.2vh] leading-none text-text">{diaryDateStamp(selectedDiary.created_at ?? selectedRun.finished_at).day}</span>
                  </div>
                  <div className="min-w-0 pt-[1.25vh]">
                    <h2 className="font-serif text-[clamp(24px,1.75vw,30px)] leading-[1.18] tracking-[-0.02em] text-[#211e1b]">{selectedDiary.title || "一次自醒"}</h2>
                    <div className="mt-[1.2vh] text-[1.82vh] text-text-muted">{selectedAuthorName} 写于 {formatDateTime(selectedDiary.created_at ?? selectedRun.finished_at)}</div>
                  </div>
                </header>

                <div
                  className="min-h-0 overflow-y-auto border-b border-dashed border-[#d8cdbb] px-[1.85vw] py-[3.2vh]"
                  style={{ scrollbarGutter: "stable" }}
                >
                  <p className="whitespace-pre-wrap font-serif text-[clamp(14px,0.88vw,16px)] leading-[2] tracking-[0.015em] text-[#302b27]">
                    {trimText(selectedDiary.content, "没有写入日记。")}
                  </p>
                </div>

                <footer className="flex flex-wrap items-center gap-[1.45vw] pt-[2.8vh] text-[1.52vh]">
                  <div className="rounded-[0.55vh] border border-[#ded5c8] bg-white/38 px-[1.15vw] py-[0.92vh]">
                    <span className="mr-[0.65vw] text-text-muted">状态</span>
                    <span className="text-text">{selectedStatus.label}</span>
                  </div>
                  <div className="rounded-[0.55vh] border border-[#ded5c8] bg-white/38 px-[1.15vw] py-[0.92vh]">
                    <span className="mr-[0.65vw] text-text-muted">下次醒来</span>
                    <span className="text-text">{selectedRun.next_wake_at ? formatDateTime(selectedRun.next_wake_at) : formatMinutes(selectedRun.next_wake_after_minutes)}</span>
                  </div>
                  <div className="rounded-[0.55vh] border border-[#ded5c8] bg-white/38 px-[1.15vw] py-[0.92vh]">
                    <span className="mr-[0.65vw] text-text-muted">安排</span>
                    <span className="text-text">{actionLabels[selectedAction?.action_type || ""] || selectedAction?.action_type || "未记录"}</span>
                  </div>
                </footer>
              </article>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-text-muted">
                <NotebookText className="mb-[1.2vh] h-[4.6vh] w-[4.6vh] text-accent/70" />
                <div className="font-serif text-[2.6vh] text-text">选择一篇日记</div>
                <div className="mt-[0.7vh] text-[1.75vh]">自醒写下的内容会在这里展开。</div>
              </div>
            )}
          </section>
        </main>
      )}
    </motion.div>
  )
}
