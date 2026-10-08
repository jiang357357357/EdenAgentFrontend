import { SessionTitleDialog } from "./SessionTitleDialog"
import {
  Brain,
  LogOut,
  Cable,
  FolderOpen,
  FileText,
  List,
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
import { useMemo, useState } from "react"
import { resolveCoreAssetUrl } from "../../lib/auth"
import type { WorkspaceEntry } from "../../lib/agent-client"
import { WorkspaceExplorer } from "./WorkspaceExplorer"
import type { SharedWorkspaceScope } from "../shared-workspace/use-shared-workspace"
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
  onOpenAllSessions: () => void
  onOpenMemo: () => void
  onOpenSkills: () => void
  onOpenConnectors: () => void
  onOpenConfiguration: () => void
  onLogout?: () => Promise<void> | void
  logoutLabel?: string
  onOpenSettings: () => void
  onOpenFile: (entry: WorkspaceEntry) => void
  onWorkspaceChanged: () => void
  onOpenSharedWorkspace: (scope: SharedWorkspaceScope) => void
  activity: "sessions" | "files"
  onActivityChange: (activity: "sessions" | "files") => void
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
  active?: "files" | "sessions" | "allSessions" | "configuration"
  onOpenFiles: () => void
  onOpenSessions: () => void
  onOpenAllSessions: () => void
  onOpenParticipants: () => void
  onOpenDutyAssistant: () => void
  onOpenSelfAwake: () => void
  onOpenMemo: () => void
  onOpenSkills: () => void
  onOpenConnectors: () => void
  onOpenConfiguration: () => void
  onLogout?: () => Promise<void> | void
  logoutLabel?: string
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
  onOpenAllSessions,
  onOpenParticipants,
  onOpenDutyAssistant,
  onOpenSelfAwake,
  onOpenMemo,
  onOpenSkills,
  onOpenConnectors,
  onOpenConfiguration,
  onLogout,
  logoutLabel = "退出登录",
  onOpenSettings,
}: ActivityRailProps) {
  return (
    <nav className="flex h-full w-16 shrink-0 flex-col border-r border-border bg-transparent" aria-label="主导航">
      <div className="min-h-0 flex-1 overflow-y-auto pb-[0.6vh]">
        <ActivityButton label="文件" icon={FolderOpen} active={active === "files"} onClick={onOpenFiles} />
        <ActivityButton label="会话" icon={MessageSquare} active={active === "sessions"} onClick={onOpenSessions} />
        <ActivityButton label="所有会话" icon={List} active={active === "allSessions"} onClick={onOpenAllSessions} />
        <ActivityButton label="参与者" icon={UsersRound} onClick={onOpenParticipants} />
        <ActivityButton label="值日生" icon={UserRoundCheck} onClick={onOpenDutyAssistant} />
        <ActivityButton label="自醒" icon={Sparkles} onClick={onOpenSelfAwake} />
        <ActivityButton label="备忘" icon={FileText} onClick={onOpenMemo} />
        <ActivityButton label="技能" icon={Brain} onClick={onOpenSkills} />
        <ActivityButton label="连接器" icon={Cable} onClick={onOpenConnectors} />
      </div>
      <ActivityButton label="配置" icon={SlidersHorizontal} active={active === "configuration"} onClick={onOpenConfiguration} />
      <ActivityButton label="设置" icon={Settings} onClick={onOpenSettings} />
      {onLogout && <ActivityButton label={logoutLabel} icon={LogOut} onClick={() => { void onLogout() }} />}
    </nav>
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
  onOpenAllSessions,
  onOpenMemo,
  onOpenSkills,
  onOpenConnectors,
  onOpenConfiguration,
  onLogout,
  logoutLabel = "退出登录",
  onOpenSettings,
  onOpenFile,
  onWorkspaceChanged,
  onOpenSharedWorkspace,
  activity,
  onActivityChange,
}: SidebarProps) {
  const [query, setQuery] = useState("")
  const [renamingSession, setRenamingSession] = useState<{ id: string; title: string } | null>(null)
  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return sessions
    return sessions.filter((session) => session.title.toLocaleLowerCase().includes(normalized))
  }, [query, sessions])
  const sessionGroups = useMemo(() => groupSessions(filteredSessions), [filteredSessions])

  return (
    <aside className="relative z-20 flex h-full w-[20vw] min-w-[280px] max-w-[360px] shrink-0 border-r border-border bg-bg/72 backdrop-blur-xl">
        <ActivityRail
          active={activity}
          onOpenFiles={() => onActivityChange("files")}
          onOpenSessions={() => onActivityChange("sessions")}
          onOpenAllSessions={onOpenAllSessions}
          onOpenParticipants={onOpenParticipants}
          onOpenDutyAssistant={onOpenDutyAssistant}
          onOpenSelfAwake={onOpenSelfAwake}
          onOpenMemo={onOpenMemo}
          onOpenSkills={onOpenSkills}
          onOpenConnectors={onOpenConnectors}
          onOpenConfiguration={onOpenConfiguration}
          onLogout={onLogout}
          logoutLabel={logoutLabel}
          onOpenSettings={onOpenSettings}
        />

        <div className="flex min-w-0 flex-1 flex-col">
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
                          setRenamingSession({ id: session.id, title: session.title })
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
                          if (!window.confirm(`移除会话“${session.title}”？会立即从列表隐藏；若任务仍在运行，将同时请求停止。`)) return
                          void onDelete(session.id)
                        }}
                        className="absolute right-[0.35vw] top-1/2 flex h-[4.2vh] w-[4.2vh] -translate-y-1/2 items-center justify-center rounded-[0.6vh] text-text-muted opacity-0 transition hover:bg-danger/10 hover:text-danger focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                        aria-label={`强制移除会话：${session.title}`}
                        title="强制移除会话"
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
            <WorkspaceExplorer sessionId={activeId || undefined} onSelect={onSelect}
              onOpenFile={onOpenFile} onWorkspaceChanged={onWorkspaceChanged} onOpenSharedWorkspace={onOpenSharedWorkspace} />
          )}

        </div>

      {renamingSession && <SessionTitleDialog key={renamingSession.id} session={renamingSession} onSave={onRename} onClose={() => setRenamingSession(null)} />}
    </aside>
  )
}
