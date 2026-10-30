import { useEffect, useId, useState } from "react"
import { ArrowLeft, FolderSync, RefreshCw, X } from "lucide-react"
import { motion } from "motion/react"
import { pageEnterMotion } from "../../lib/page-motion"
import { NoticeCard } from "../../components/feedback"
import type { SharedWorkspaceStateOwner } from "../../components/shared-workspace/shared-workspace-state"
import { sharedButtonClass } from "../../components/shared-workspace/shared-workspace-view"
import { SharedWorkspaceNavigation, sharedWorkspaceSections, type SharedWorkspaceSection } from "./SharedWorkspaceNavigation"
import { SharedWorkspacePanel } from "./SharedWorkspacePanel"
import { hostsInMode, spacesInMode, type SharedWorkspaceMode } from "../../components/shared-workspace/shared-workspace-mode"
import { SharedWorkspaceModeSwitch } from "./SharedWorkspaceModeSwitch"

interface PageProps {
  owner: SharedWorkspaceStateOwner
  root: string
  choosing?: boolean
  directoryError?: string
  onBack(): void
  onChooseWorkspace(): void
}

export function SharedWorkspacePageView({ owner, root, choosing = false, directoryError, onBack, onChooseWorkspace }: PageProps) {
  const mode: SharedWorkspaceMode = owner.state.posture?.mode ?? 'lan'
  const [selections, setSelections] = useState<Record<SharedWorkspaceMode, string | null>>({ lan: null, cloud: null })
  const [sections, setSections] = useState<Record<SharedWorkspaceMode, SharedWorkspaceSection>>({ lan: 'libraries', cloud: 'network' })
  const section = sections[mode]
  const setSection = (value: SharedWorkspaceSection) => setSections(before => ({ ...before, [mode]: value }))
  const setSelection = (value: string) => setSelections(before => ({ ...before, [mode]: value }))
  const prefix = useId()
  const state = owner.state
  const { status } = state
  const busy = state.busy || choosing
  const spaces = spacesInMode(state.spaces, state.hosts, mode)
  const hosts = hostsInMode(state.hosts, mode)
  const selectedId = selections[mode] ?? status?.spaceId ?? ""
  const selected = spaces.find(space => space.id === selectedId)
  const boundInMode = spaces.some(space => space.id === status?.spaceId)
  const canSync = !!selected && status?.spaceId === selected.id && !!status?.bound
  useEffect(() => {
    if (mode !== 'cloud') return
    if ((['sync', 'conflicts', 'history'].includes(section) && !canSync) || (section === 'members' && !selected)) setSection('libraries')
  }, [mode, section, canSync, selected?.id])
  useEffect(() => {
    if (busy || !hosts.length || hosts.some(host => host.deviceId === state.managementHostId)) return
    const target = hosts.find(host => host.local) ?? hosts[0]
    void owner.selectHost(target.deviceId)
  }, [owner, mode, state.hosts, state.managementHostId, busy])
  const chooseWorkspace = () => {
    if (selected) setSelection(selected.id)
    onChooseWorkspace()
  }
  const error = directoryError || state.error
  return <motion.main {...pageEnterMotion} className="flex h-full min-h-0 w-full flex-col bg-library-bg text-text" aria-labelledby="shared-workspace-title">
    <PageHeader loading={state.loading} busy={busy || !state.posture || state.deployment?.state === 'running'} mode={state.posture?.mode ?? null}
      deploying={state.deployment?.state === 'running'} onBack={onBack} onRefresh={() => void owner.refresh(true)}
      onSelectMode={value => { void owner.selectPosture(value) }} />
    {mode === 'lan' ? <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3 text-sm sm:px-8">
      <span className="text-text-muted">共享目录</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs" title={root}>{root || '尚未选择独立共享目录'}</span>
      <button type="button" className="rounded-lg border border-border px-3 py-2 hover:bg-card disabled:opacity-50"
        disabled={busy} onClick={chooseWorkspace}>选择共享目录…</button>
    </div> : null}
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <SharedWorkspaceNavigation mode={mode} active={section} prefix={prefix} pending={boundInMode ? status?.pending || 0 : 0} conflicts={boundInMode ? status?.conflicts || 0 : 0} onSelect={setSection}
        hasSelection={!!selected} canSync={canSync} canManageMembers={selected?.role === 'owner' || canSync} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {error || state.notice ? <div className="relative max-h-[30vh] shrink-0 space-y-3 overflow-y-auto px-4 pt-4 sm:px-8">
          <button type="button" aria-label="关闭提示" className="absolute right-5 top-5 rounded p-1 text-text-muted hover:bg-surface-hover sm:right-9" onClick={() => owner.dismissFeedback()}><X className="h-4 w-4" /></button>
          {error ? <NoticeCard tone="error" title="共享资料库操作未完成" description={error} /> : null}
          {state.notice ? <p role="status" className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm">{state.notice}</p> : null}
        </div> : null}
        {!status ? <p role="status" className="p-8 text-sm text-text-muted">正在读取资料库…</p>
          : !status.available ? <div className="p-4 sm:p-8">
              <NoticeCard tone="neutral" title="共享资料库暂不可用" description={status.reason || "请检查共享资料库服务是否已启用。"} />
            </div>
          : sharedWorkspaceSections.map(({ id }) => <section key={id} id={`${prefix}-panel-${id}`} aria-labelledby={`${prefix}-navigation-${id}`}
              hidden={section !== id} data-shared-workspace-section={id} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-6">
              <SharedWorkspacePanel key={`${mode}-${id}`} mode={mode} section={id} owner={owner} selected={selected} root={root} busy={busy}
                onSelect={setSelection} onChooseWorkspace={chooseWorkspace} onShowLibraries={() => setSection("libraries")} onManageHost={() => setSection('network')} />
            </div>
          </section>)}
      </div>
    </div>
  </motion.main>
}

function PageHeader({ loading, busy, mode, deploying, onBack, onRefresh, onSelectMode }: {
  loading: boolean; busy: boolean; mode: SharedWorkspaceMode | null; deploying: boolean
  onBack(): void; onRefresh(): void; onSelectMode(mode: SharedWorkspaceMode): void
}) {
  return <header className="shrink-0 border-b border-border/70 px-4 py-4 sm:px-8 sm:py-5">
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
        <button type="button" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg py-2 text-xl font-medium text-text-muted hover:text-text focus-visible:outline-accent sm:text-2xl" onClick={onBack}>
          <ArrowLeft className="h-6 w-6" />返回会话
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-3 lg:flex-initial">
          <FolderSync className="h-8 w-8 shrink-0 text-accent" />
          <div className="min-w-0">
            <h1 id="shared-workspace-title" className="whitespace-nowrap text-xl font-semibold sm:text-2xl">共享资料库</h1>
          </div>
        </div>
        <div className="order-1 w-full lg:order-none lg:w-auto">
          <SharedWorkspaceModeSwitch mode={mode} busy={busy} deploying={deploying} onSelect={onSelectMode} />
        </div>
        <button type="button" className={`${sharedButtonClass} ml-auto inline-flex shrink-0 items-center gap-2 py-2`} aria-label={loading ? "正在刷新" : "刷新"} disabled={busy || loading} onClick={onRefresh}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /><span className="hidden sm:inline">{loading ? "正在刷新" : "刷新"}</span>
        </button>
      </div>
    </div>
  </header>
}
