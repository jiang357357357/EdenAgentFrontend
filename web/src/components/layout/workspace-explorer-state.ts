import type { getWorkspace, switchWorkspace, WorkspaceDirectory, WorkspaceEntry } from "../../lib/agent-client"

export type WorkspaceInfo = Awaited<ReturnType<typeof getWorkspace>>
type SwitchResult = Awaited<ReturnType<typeof switchWorkspace>>
export interface WorkspaceExplorerState {
  info: WorkspaceInfo | null
  entries: WorkspaceEntry[]
  loading: boolean
  busy: boolean
  error: string
}

interface WorkspaceAccess {
  revision(): number
  info(): Promise<WorkspaceInfo>
  list(): Promise<WorkspaceDirectory>
  switch(sessionId: string | undefined, path: string): Promise<SwitchResult>
  useDefault(sessionId: string | undefined): Promise<SwitchResult>
  selected(sessionId: string): void
  changed(): void
}

/** Owns explorer requests; changing account/world invalidates reads and actions. */
export class WorkspaceExplorerStateOwner {
  state: WorkspaceExplorerState = { info: null, entries: [], loading: false, busy: false, error: "" }
  private readonly revision: number
  private active = true
  private epoch = 0
  private readSequence = 0
  private listingSequence = 0
  private readonly access: WorkspaceAccess
  private readonly publish: (state: WorkspaceExplorerState) => void

  constructor(access: WorkspaceAccess, publish: (state: WorkspaceExplorerState) => void) {
    this.access = access
    this.publish = publish
    this.revision = access.revision()
  }

  activate(): void { this.active = true }
  dispose(): void { this.active = false; this.epoch++ }
  isCurrent = (): boolean => this.active && this.revision === this.access.revision()

  private capture(): () => boolean {
    const epoch = this.epoch
    return () => this.isCurrent() && epoch === this.epoch
  }

  private update(values: Partial<WorkspaceExplorerState>): void {
    this.state = { ...this.state, ...values }
    this.publish(this.state)
  }

  async load(): Promise<void> {
    if (!this.isCurrent()) return
    const sequence = ++this.readSequence
    const scopeCurrent = this.capture()
    const current = () => scopeCurrent() && sequence === this.readSequence
    this.update({ loading: true, error: "", entries: [] })
    try {
      const info = await this.access.info()
      if (!current()) return
      this.update({ info })
      if (info.status !== "ready") return
      const directory = await this.access.list()
      if (current()) this.update({ entries: directory.entries })
    } catch (error) {
      if (current()) this.update({ error: error instanceof Error ? error.message : "读取工作区失败" })
    } finally {
      if (current()) this.update({ loading: false })
    }
  }

  async choose(sessionId: string | undefined, select: () => Promise<string | null | undefined>): Promise<void> {
    await this.change(async current => {
      const path = await select()
      if (!path || !current()) return undefined
      return this.access.switch(sessionId, path)
    })
  }

  /** Background sync refreshes files without resetting the workspace or tree. */
  async refreshFiles(): Promise<boolean> {
    if (!this.isCurrent() || this.state.loading || this.state.busy || this.state.info?.status !== "ready") return false
    const scope = this.capture(), loadSequence = this.readSequence, sequence = ++this.listingSequence
    const current = () => scope() && loadSequence === this.readSequence && sequence === this.listingSequence
    try {
      const directory = await this.access.list()
      if (!current()) return false
      this.update({ entries: directory.entries, error: "" })
      return true
    } catch (error) {
      if (current()) this.update({ error: error instanceof Error ? error.message : "刷新文件列表失败" })
      return false
    }
  }

  async useDefault(sessionId: string | undefined): Promise<void> {
    if (!this.state.info?.defaultPath) return
    await this.change(() => this.access.useDefault(sessionId))
  }

  reportError(message: string): void {
    if (this.isCurrent()) this.update({ error: message })
  }

  private async change(action: (current: () => boolean) => Promise<SwitchResult | undefined>): Promise<void> {
    if (!this.isCurrent() || this.state.busy) return
    const current = this.capture()
    this.update({ busy: true, error: "" })
    try {
      const result = await action(current)
      if (!result || !current()) return
      if (result.createdAuditSession) this.access.selected(result.auditSessionId)
      this.access.changed()
      // Re-read after completion even if the workspace.changed event was missed.
      await this.load()
    } catch (error) {
      if (current()) this.update({ error: error instanceof Error ? error.message : "工作区切换失败" })
    } finally {
      if (current()) this.update({ busy: false })
    }
  }
}
