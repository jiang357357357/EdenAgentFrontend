import {
  Brain,
  Cable,
  ChevronDown,
  ChevronRight,
  File,
  FolderOpen,
  FileText,
  MessageSquare,
  Plus,
  Pencil,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRoundCheck,
  UsersRound,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { resolveCoreAssetUrl } from "../../lib/auth"
import { getWorkspace, listWorkspaceDirectory, switchWorkspace, type WorkspaceEntry } from "../../lib/agent-client"
import { openDesktopWorkspaceDirectory, selectDesktopWorkspaceDirectory } from "../../lib/desktop-window"
import { cn } from "../../lib/utils"
import type { Session } from "../../types"

interface SidebarProps {
  sessions: Session[]
  activeId: string
  onSelect: (id: string) => void
  onDelete: (id: string) => Promise<void> | void
  onRename: (id: string, title: string) => Promise<void> | void
  onNewSession: () => void
  onOpenParticipants: () => void
  onOpenDutyAssistant: () => void
  onOpenSelfAwake: () => void
  onOpenMemo: () => void
  onOpenSkills: () => void
  onOpenConnectors: () => void
  onOpenConfiguration: () => void
  onOpenSettings: () => void
  onOpenFile: (entry: WorkspaceEntry) => void
  onWorkspaceChanged: () => void
}

type SessionGroup = { label: string; sessions: Session[] }

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

function groupSessions(sessions: Session[]): SessionGroup[] {
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = today - 86_400_000
  const week = today - 6 * 86_400_000
  const buckets = new Map<string, Session[]>()

  for (const session of sessions) {
    const updatedAt = session.updatedAt ?? 0
    const label = updatedAt >= today
      ? "今天"
      : updatedAt >= yesterday
        ? "昨天"
        : updatedAt >= week
          ? "本周"
          : "更早"
    const items = buckets.get(label) ?? []
    items.push(session)
    buckets.set(label, items)
  }

  return ["今天", "昨天", "本周", "更早"]
    .flatMap((label) => buckets.has(label) ? [{ label, sessions: buckets.get(label)! }] : [])
}

function sessionAvatarUrl(session: Session) {
  const participantAvatar = [...(session.participants ?? [])]
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .find((participant) => participant.avatarUrl)?.avatarUrl
  if (participantAvatar) return resolveCoreAssetUrl(participantAvatar)

  const recentSpeakerAvatar = [...session.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.speaker?.avatarUrl)
    ?.speaker?.avatarUrl
  return resolveCoreAssetUrl(recentSpeakerAvatar)
}

function SessionAvatar({ session, active }: { session: Session; active: boolean }) {
  const avatarUrl = sessionAvatarUrl(session)
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)
  const showAvatar = Boolean(avatarUrl && failedAvatarUrl !== avatarUrl)

  return (
    <span className="relative flex h-[4.2vh] w-[4.2vh] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card">
      {showAvatar ? (
        <img
          key={avatarUrl}
          src={avatarUrl!}
          alt=""
          className="h-full w-full object-cover object-top"
          loading="lazy"
          onError={() => setFailedAvatarUrl(avatarUrl!)}
        />
      ) : (
        <MessageSquare className={cn("h-[2.6vh] w-[2.6vh]", active && "text-accent")} />
      )}
    </span>
  )
}

interface ActivityButtonProps {
  label: string
  icon: React.ComponentType<{ className?: string }>
  active?: boolean
  onClick: () => void
}

export interface ActivityRailProps {
  active?: "files" | "sessions" | "configuration"
  onOpenFiles: () => void
  onOpenSessions: () => void
  onOpenParticipants: () => void
  onOpenDutyAssistant: () => void
  onOpenSelfAwake: () => void
  onOpenMemo: () => void
  onOpenSkills: () => void
  onOpenConnectors: () => void
  onOpenConfiguration: () => void
  onOpenSettings: () => void
}

function ActivityButton({ label, icon: Icon, active, onClick }: ActivityButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-[7.2vh] min-h-12 w-full flex-col items-center justify-center gap-[0.35vh] border-l-2 text-text-muted transition-colors",
        active
          ? "border-accent bg-accent/5 text-accent"
          : "border-transparent hover:bg-card hover:text-text",
      )}
      aria-label={label}
      title={label}
    >
      <Icon className="h-[2.5vh] min-h-5 w-[2.5vh] min-w-5" />
      <span className="text-[1.15vh] leading-none">{label}</span>
    </button>
  )
}

export function ActivityRail({
  active,
  onOpenFiles,
  onOpenSessions,
  onOpenParticipants,
  onOpenDutyAssistant,
  onOpenSelfAwake,
  onOpenMemo,
  onOpenSkills,
  onOpenConnectors,
  onOpenConfiguration,
  onOpenSettings,
}: ActivityRailProps) {
  return (
    <nav className="flex h-full w-16 shrink-0 flex-col border-r border-border bg-bg" aria-label="主导航">
      <div className="flex-1 pb-[0.6vh]">
        <ActivityButton label="文件" icon={FolderOpen} active={active === "files"} onClick={onOpenFiles} />
        <ActivityButton label="会话" icon={MessageSquare} active={active === "sessions"} onClick={onOpenSessions} />
        <ActivityButton label="参与者" icon={UsersRound} onClick={onOpenParticipants} />
        <ActivityButton label="值日生" icon={UserRoundCheck} onClick={onOpenDutyAssistant} />
        <ActivityButton label="自醒" icon={Sparkles} onClick={onOpenSelfAwake} />
        <ActivityButton label="备忘" icon={FileText} onClick={onOpenMemo} />
        <ActivityButton label="技能" icon={Brain} onClick={onOpenSkills} />
        <ActivityButton label="连接器" icon={Cable} onClick={onOpenConnectors} />
      </div>
      <ActivityButton label="配置" icon={SlidersHorizontal} active={active === "configuration"} onClick={onOpenConfiguration} />
      <ActivityButton label="设置" icon={Settings} onClick={onOpenSettings} />
    </nav>
  )
}

function FileTreeNode({ entry, depth = 0, onOpenFile }: { entry: WorkspaceEntry; depth?: number; onOpenFile: (entry: WorkspaceEntry) => void }) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<WorkspaceEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    if (entry.type !== "directory") {
      onOpenFile(entry)
      return
    }
    const nextOpen = !open
    setOpen(nextOpen)
    if (!nextOpen || children) return
    setLoading(true)
    try {
      setChildren((await listWorkspaceDirectory(entry.path)).entries)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void toggle()} className="flex h-8 w-full items-center gap-1.5 truncate pr-2 text-left text-[clamp(14px,1.65vh,17px)] text-text-muted hover:bg-card hover:text-text" style={{ paddingLeft: `${0.55 + depth * 0.85}rem` }} title={entry.path}>
        {entry.type === "directory" ? (open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />) : <span className="w-4 shrink-0" />}
        {entry.type === "directory" ? <FolderOpen className="h-4 w-4 shrink-0 text-accent/80" /> : <File className="h-4 w-4 shrink-0" />}
        <span className="truncate">{entry.name}</span>
      </button>
      {open ? <div>
        {loading ? <div className="py-1 text-xs text-text-muted" style={{ paddingLeft: `${2.4 + depth * 0.85}rem` }}>读取中…</div> : null}
        {children?.map((child) => <FileTreeNode key={child.path} entry={child} depth={depth + 1} onOpenFile={onOpenFile} />)}
        {children?.length === 0 ? <div className="py-1 text-xs text-text-muted" style={{ paddingLeft: `${2.4 + depth * 0.85}rem` }}>空目录</div> : null}
      </div> : null}
    </div>
  )
}

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onDelete,
  onRename,
  onNewSession,
  onOpenParticipants,
  onOpenDutyAssistant,
  onOpenSelfAwake,
  onOpenMemo,
  onOpenSkills,
  onOpenConnectors,
  onOpenConfiguration,
  onOpenSettings,
  onOpenFile,
  onWorkspaceChanged,
}: SidebarProps) {
  const [query, setQuery] = useState("")
  const [activity, setActivity] = useState<"sessions" | "files">("sessions")
  const [workspaceName, setWorkspaceName] = useState("工作区")
  const [workspacePath, setWorkspacePath] = useState("")
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceEntry[]>([])
  const [workspaceError, setWorkspaceError] = useState("")
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const [workspacePending, setWorkspacePending] = useState("")
  const [workspaceSwitching, setWorkspaceSwitching] = useState(false)
  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return sessions
    return sessions.filter((session) => session.title.toLocaleLowerCase().includes(normalized))
  }, [query, sessions])
  const sessionGroups = useMemo(() => groupSessions(filteredSessions), [filteredSessions])

  useEffect(() => {
    if (activity !== "files" || workspaceLoaded || workspaceLoading) return
    setWorkspaceLoading(true)
    setWorkspaceError("")
    void Promise.allSettled([getWorkspace(), listWorkspaceDirectory()])
      .then(([workspaceResult, directoryResult]) => {
        const errors: string[] = []
        if (workspaceResult.status === "fulfilled") {
          setWorkspaceName(workspaceResult.value.name)
          setWorkspacePath(workspaceResult.value.path)
          setWorkspacePending(workspaceResult.value.pendingPath ?? "")
        } else {
          errors.push(workspaceResult.reason instanceof Error ? workspaceResult.reason.message : "读取工作区信息失败")
        }
        if (directoryResult.status === "fulfilled") {
          setWorkspaceEntries(directoryResult.value.entries)
        } else {
          errors.push(directoryResult.reason instanceof Error ? directoryResult.reason.message : "读取工作区目录失败")
        }
        setWorkspaceError(errors.join("；"))
      })
      .finally(() => { setWorkspaceLoading(false); setWorkspaceLoaded(true) })
  }, [activity, workspaceLoaded, workspaceLoading])

  useEffect(() => {
    const refreshWorkspace = () => {
      setWorkspaceEntries([])
      setWorkspaceError("")
      setWorkspacePending("")
      setWorkspaceLoaded(false)
      onWorkspaceChanged()
    }
    window.addEventListener("edenagent:workspace-changed", refreshWorkspace)
    return () => window.removeEventListener("edenagent:workspace-changed", refreshWorkspace)
  }, [onWorkspaceChanged])

  const chooseWorkspace = async () => {
    if (workspaceSwitching || workspacePending) return
    setWorkspaceSwitching(true)
    setWorkspaceError("")
    try {
      const selected = await selectDesktopWorkspaceDirectory(workspacePath)
      if (!selected) return
      setWorkspaceMenuOpen(false)
      const result = await switchWorkspace(activeId || sessions[0]?.id, selected)
      if (result.createdAuditSession) onSelect(result.auditSessionId)
      setWorkspacePending(result.pendingPath ?? selected)
      setWorkspaceError("")
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "工作区切换失败")
    } finally {
      setWorkspaceSwitching(false)
    }
  }

  const retryWorkspace = () => {
    setWorkspaceEntries([])
    setWorkspaceError("")
    setWorkspaceLoaded(false)
  }

  return (
    <aside className="relative z-20 flex h-full w-[20vw] min-w-[280px] max-w-[360px] shrink-0 border-r border-border bg-bg">
        <ActivityRail
          active={activity}
          onOpenFiles={() => setActivity("files")}
          onOpenSessions={() => setActivity("sessions")}
          onOpenParticipants={onOpenParticipants}
          onOpenDutyAssistant={onOpenDutyAssistant}
          onOpenSelfAwake={onOpenSelfAwake}
          onOpenMemo={onOpenMemo}
          onOpenSkills={onOpenSkills}
          onOpenConnectors={onOpenConnectors}
          onOpenConfiguration={onOpenConfiguration}
          onOpenSettings={onOpenSettings}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {activity === "files" ? (
            <div className="relative flex h-[8.4vh] min-h-16 items-center justify-between border-b border-border px-4">
              <div className="flex min-w-0 items-baseline gap-2">
                <div className="shrink-0 text-[clamp(17px,2vh,21px)] font-semibold text-text">资源管理器</div>
                <button type="button" onClick={() => setWorkspaceMenuOpen((open) => !open)} className="truncate rounded px-1 py-0.5 text-[clamp(14px,1.5vh,16px)] text-text-muted hover:bg-card hover:text-text" title={workspacePath || workspaceName}>{workspaceName}</button>
              </div>
            {workspaceMenuOpen ? (
              <div className="absolute left-4 top-[calc(100%-0.4rem)] z-40 w-52 rounded-xl border border-border bg-card p-1.5 text-sm shadow-xl">
                <button type="button" onClick={() => { setWorkspaceMenuOpen(false); void openDesktopWorkspaceDirectory(workspacePath) }} disabled={!window.edenAgentDesktop || !workspacePath} className="flex w-full rounded-lg px-3 py-2 text-left text-text hover:bg-bg disabled:opacity-40">在系统文件管理器中打开</button>
                <button type="button" onClick={() => void chooseWorkspace()} disabled={!window.edenAgentDesktop || workspaceSwitching || Boolean(workspacePending)} className="flex w-full rounded-lg px-3 py-2 text-left text-text hover:bg-bg disabled:opacity-40">{workspaceSwitching ? "正在选择…" : workspacePending ? "等待切换…" : "切换工作区…"}</button>
                <div className="px-3 py-2 text-xs text-text-muted">{workspacePending ? `等待当前任务结束后切换到 ${workspacePending}` : "选择项目文件夹；没有会话时会自动保存当前空白会话"}</div>
              </div>
            ) : null}
            </div>
          ) : null}

          {activity === "sessions" ? <><div className="flex items-center gap-2 border-b border-border p-3">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 text-text-muted focus-within:border-accent/50 focus-within:text-text">
              <Search className="h-4 w-4 shrink-0" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索会话"
                className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-lighter"
              />
            </label>
            <button
              type="button"
              onClick={onNewSession}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-card hover:text-accent"
              aria-label="新会话"
              title="新会话"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {sessionGroups.length ? sessionGroups.map((group) => (
              <section key={group.label} className="mb-3">
                <h2 className="px-2 pb-1 pt-2 text-[1.2vh] font-medium text-text-muted">{group.label}</h2>
                <ul className="space-y-[0.5vh]">
                  {group.sessions.map((session) => (
                    <li key={session.id} className="group relative focus-within:z-10">
                      <button
                        type="button"
                        onClick={() => onSelect(session.id)}
                        title={session.title}
                        aria-label={`打开会话：${session.title}`}
                        className={cn(
                          "flex h-[7vh] w-full items-center gap-[0.8vw] rounded-[0.9vh] border-l-2 px-[0.75vw] pr-[4.6vw] text-left text-[1.7vh] transition-colors",
                          activeId === session.id
                            ? "border-accent bg-accent/8 text-text"
                            : "border-transparent text-text-muted hover:bg-card hover:text-text",
                        )}
                      >
                        <SessionAvatar session={session} active={activeId === session.id} />
                        <span className="min-w-0 flex-1 truncate">{session.title}</span>
                        <span className="shrink-0 text-[1.35vh] text-text-lighter">{session.date}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          const title = window.prompt("重命名会话", session.title)?.trim()
                          if (!title || title === session.title) return
                          void onRename(session.id, title)
                        }}
                        className="absolute right-[2.55vw] top-1/2 flex h-[4.2vh] w-[4.2vh] -translate-y-1/2 items-center justify-center rounded-[0.6vh] text-text-muted opacity-0 transition hover:bg-accent/10 hover:text-accent focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                        aria-label={`重命名会话：${session.title}`}
                        title="重命名会话"
                      >
                        <Pencil className="h-[2vh] w-[2vh]" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          if (!window.confirm(`永久删除会话“${session.title}”？删除后无法恢复。`)) return
                          void onDelete(session.id)
                        }}
                        className="absolute right-[0.35vw] top-1/2 flex h-[4.2vh] w-[4.2vh] -translate-y-1/2 items-center justify-center rounded-[0.6vh] text-text-muted opacity-0 transition hover:bg-red-500/10 hover:text-red-500 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                        aria-label={`永久删除会话：${session.title}`}
                        title="永久删除会话"
                      >
                        <Trash2 className="h-[2vh] w-[2vh]" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )) : (
              <div className="px-4 py-10 text-center text-sm text-text-muted">没有匹配的会话</div>
            )}
          </div></> : (
            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              {workspaceLoading ? <div className="px-4 py-6 text-sm text-text-muted">正在读取工作区…</div> : null}
              {workspaceError ? (
                <div className="mx-3 my-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                  <div className="break-words">{workspaceError}</div>
                  <button type="button" onClick={retryWorkspace} className="mt-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-red-100">重新读取</button>
                </div>
              ) : null}
              {!workspaceLoading ? workspaceEntries.map((entry) => <FileTreeNode key={entry.path} entry={entry} onOpenFile={onOpenFile} />) : null}
            </div>
          )}

        </div>

    </aside>
  )
}
