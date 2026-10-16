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
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from "lucide-react"
import { useMemo, useState } from "react"
import { VirtualSessionList } from "./VirtualSessionList"
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
  onArchive: (id: string, archived: boolean) => Promise<void> | void
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
  onArchive,
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
    return sessions.filter((session) => !session.archived && (!normalized || session.title.toLocaleLowerCase().includes(normalized)))
  }, [query, sessions])

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

          <VirtualSessionList sessions={filteredSessions} activeId={activeId} resetKey={query}
            onSelect={onSelect} onRename={setRenamingSession} onDelete={onDelete} onArchive={onArchive} /></> : (
            <WorkspaceExplorer sessionId={activeId || undefined} onSelect={onSelect}
              onOpenFile={onOpenFile} onWorkspaceChanged={onWorkspaceChanged} onOpenSharedWorkspace={onOpenSharedWorkspace} />
          )}

        </div>

      {renamingSession && <SessionTitleDialog key={renamingSession.id} session={renamingSession} onSave={onRename} onClose={() => setRenamingSession(null)} />}
    </aside>
  )
}
