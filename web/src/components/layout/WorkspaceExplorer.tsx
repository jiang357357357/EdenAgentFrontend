import { useEffect, useMemo, useRef, useState } from "react"
import { createWorkspaceSession, getWorkspace, listWorkspaceDirectory, switchWorkspace, useDefaultWorkspace, type WorkspaceEntry } from "../../lib/agent-client"
import { openDesktopWorkspaceDirectory, selectDesktopWorkspaceDirectory } from "../../lib/desktop-window"
import { getRuntimeOriginRevision } from "../../lib/runtime-origin"
import { WorkspaceExplorerStateOwner } from "./workspace-explorer-state"
import { WorkspaceFileTree } from "./WorkspaceFileTree"
import { WorkspaceNotice } from "./WorkspaceNotice"
import { SharedWorkspaceEntry } from "../shared-workspace/SharedWorkspaceEntry"
import type { SharedWorkspaceScope } from "../shared-workspace/use-shared-workspace"
import { createWorkspaceConversation } from "./create-workspace-conversation"

export function WorkspaceExplorer({ sessionId, onSelect, onOpenFile, onWorkspaceChanged, onOpenSharedWorkspace }: {
  sessionId?: string
  onSelect(id: string): void
  onOpenFile(entry: WorkspaceEntry): void
  onWorkspaceChanged(): void
  onOpenSharedWorkspace(scope: SharedWorkspaceScope): void
}) {
  const [revision, setRevision] = useState(getRuntimeOriginRevision)
  const [, redraw] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [workspaceRevision, setWorkspaceRevision] = useState(0)
  const [filesRevision, setFilesRevision] = useState(0)
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false)
  const mounted = useRef(true)
  const selectedSession = useRef(sessionId)
  selectedSession.current = sessionId
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const callbacks = useRef({ onSelect, onWorkspaceChanged })
  callbacks.current = { onSelect, onWorkspaceChanged }
  const owner = useMemo(() => new WorkspaceExplorerStateOwner({
    revision: getRuntimeOriginRevision,
    info: () => { if (!sessionId) throw new Error("请先创建或选择会话"); return getWorkspace(sessionId) },
    list: () => { if (!sessionId) throw new Error("请先创建或选择会话"); return listWorkspaceDirectory(sessionId) },
    switch: switchWorkspace, useDefault: useDefaultWorkspace,
    selected: id => callbacks.current.onSelect(id), changed: () => callbacks.current.onWorkspaceChanged(),
  }, () => redraw(value => value + 1)), [revision, sessionId])
  const state = owner.state
  const currentOwner = useRef(owner)
  currentOwner.current = owner
  const { info } = state
  const workspacePath = info?.path ?? ""
  const workspaceName = info?.status === "unselected" ? "未选择文件夹" : info?.name || "工作区"
  useEffect(() => {
    owner.activate()
    if (sessionId) void owner.load()
    const relevant = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionID?: string; sessionId?: string }>).detail
      return Boolean(sessionId && (detail?.sessionId === sessionId || detail?.sessionID === sessionId))
    }
    const refresh = (event: Event) => { if (relevant(event) && owner.isCurrent()) { setWorkspaceRevision(value => value + 1); callbacks.current.onWorkspaceChanged(); void owner.load() } }
    const failed = (event: Event) => { if (relevant(event)) owner.reportError((event as CustomEvent<{ error?: string }>).detail?.error || "工作区切换失败") }
    const scopeChanged = () => {
      if (owner.isCurrent()) return
      owner.dispose()
      setMenuOpen(false)
      setRevision(getRuntimeOriginRevision())
    }
    window.addEventListener("edenagent:workspace-changed", refresh)
    window.addEventListener("edenagent:workspace-switch-failed", failed)
    window.addEventListener("edenagent:account-changed", scopeChanged)
    window.addEventListener("edenagent:runtime-origin-changed", scopeChanged)
    window.addEventListener("storage", scopeChanged)
    return () => {
      owner.dispose()
      window.removeEventListener("edenagent:workspace-changed", refresh)
      window.removeEventListener("edenagent:workspace-switch-failed", failed)
      window.removeEventListener("edenagent:account-changed", scopeChanged)
      window.removeEventListener("edenagent:runtime-origin-changed", scopeChanged)
      window.removeEventListener("storage", scopeChanged)
    }
  }, [owner])
  const choose = () => {
    setMenuOpen(false)
    if (!sessionId) { owner.reportError("请先创建或选择会话，再为它选择文件夹"); return }
    void owner.choose(sessionId, async () => window.edenAgentDesktop
      ? await selectDesktopWorkspaceDirectory(workspacePath)
      : window.prompt("输入服务端上的文件夹绝对路径", workspacePath)?.trim())
  }
  const createAndChoose = () => {
    if (creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    setMenuOpen(false)
    void createWorkspaceConversation({
      current: () => ({ sessionId: selectedSession.current, revision: getRuntimeOriginRevision(), mounted: mounted.current }),
      create: createWorkspaceSession,
      selected: id => { selectedSession.current = id; callbacks.current.onSelect(id) },
      choose: async () => window.edenAgentDesktop ? await selectDesktopWorkspaceDirectory()
        : window.prompt("为新会话选择文件夹：输入服务端上的绝对路径")?.trim(),
      bind: switchWorkspace,
      changed: () => { callbacks.current.onWorkspaceChanged(); void currentOwner.current.load() },
      error: message => currentOwner.current.reportError(message),
    }).finally(() => { creatingRef.current = false; if (mounted.current) setCreating(false) })
  }
  const openDirectory = async () => {
    setMenuOpen(false)
    if (!owner.isCurrent() || info?.status !== "ready") return
    try { await openDesktopWorkspaceDirectory(workspacePath) }
    catch (error) { owner.reportError(error instanceof Error ? error.message : "打开工作区失败") }
  }
  const refreshFiles = async () => {
    if (await owner.refreshFiles()) setFilesRevision(value => value + 1)
  }
  return <>
    <div className="relative flex h-[8.4vh] min-h-16 items-center justify-between border-b border-border px-4">
      <div className="flex min-w-0 items-baseline gap-2">
        <div className="shrink-0 text-[clamp(17px,2vh,21px)] font-semibold text-text">资源管理器</div>
        <button type="button" onClick={() => setMenuOpen(open => !open)} className="truncate rounded px-1 py-0.5 text-[clamp(14px,1.5vh,16px)] text-text-muted hover:bg-card hover:text-text" title={workspacePath || workspaceName}>{workspaceName}</button>
      </div>
      {menuOpen ? <div className="absolute left-4 top-[calc(100%-0.4rem)] z-40 w-52 rounded-xl border border-border bg-card p-1.5 text-sm shadow-xl">
        <button type="button" onClick={() => void openDirectory()} disabled={!window.edenAgentDesktop || info?.status !== "ready"} className="flex w-full rounded-lg px-3 py-2 text-left text-text hover:bg-bg disabled:opacity-40">在系统文件管理器中打开</button>
        <button type="button" onClick={choose} disabled={state.busy} className="flex w-full rounded-lg px-3 py-2 text-left text-text hover:bg-bg disabled:opacity-40">{state.busy ? "正在切换…" : "切换工作区…"}</button>
        <button type="button" onClick={() => { setMenuOpen(false); void refreshFiles() }} disabled={state.busy || state.loading} className="flex w-full rounded-lg px-3 py-2 text-left text-text hover:bg-bg disabled:opacity-40">刷新文件列表</button>
        {info?.defaultPath && info.kind !== "managed" ? <button type="button" onClick={() => { setMenuOpen(false); void owner.useDefault(sessionId) }} disabled={state.busy} className="flex w-full rounded-lg px-3 py-2 text-left text-text hover:bg-bg disabled:opacity-40">回到默认工作区</button> : null}
        <div className="px-3 py-2 text-xs text-text-muted">选择项目文件夹后，即可浏览文件。</div>
      </div> : null}
    </div>
    {sessionId ? <SharedWorkspaceEntry key={`${sessionId}:${revision}`} sessionId={sessionId} onOpen={onOpenSharedWorkspace} /> : null}
    <div className="min-h-0 flex-1 overflow-y-auto py-2">
      {state.loading ? <div className="px-4 py-6 text-sm text-text-muted">正在读取工作区…</div> : null}
      <WorkspaceNotice state={state} onRetry={() => void owner.load()} onChoose={choose} onUseDefault={() => void owner.useDefault(sessionId)} />
      {!sessionId ? <div className="px-4 py-6 text-sm text-text-muted">
        <p>为新会话选择文件夹。取消选择会保留空会话，不会发送消息或运行模型。</p>
        <button type="button" disabled={creating || state.busy} onClick={createAndChoose} className="mt-3 rounded-lg border border-border px-3 py-2 text-text disabled:opacity-50">
          {creating ? "正在创建或选择…" : "新建会话并选择文件夹"}
        </button>
      </div> : null}
      {!state.loading && sessionId && info?.status === "ready" ? state.entries.map(entry => <WorkspaceFileTree key={`${sessionId}:${entry.path}`} sessionId={sessionId} entry={entry} onOpenFile={onOpenFile} isCurrent={owner.isCurrent} revision={filesRevision} />) : null}
    </div>
  </>
}
