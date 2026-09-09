import type { ModelSelectionTarget, RuntimeModelConfig, RuntimeModelOption } from './runtime-models'

interface ModelMenuApi {
  load(sessionId?: string): Promise<RuntimeModelConfig>
  save(id: number | string, sessionId?: string, target?: ModelSelectionTarget): Promise<RuntimeModelConfig>
}
interface ModelMenuState {
  config: RuntimeModelConfig | null
  loading: boolean
  submitting: string | null
  error: string | null
}

export class ModelMenuController {
  private state: ModelMenuState = { config: null, loading: false, submitting: null, error: null }
  private revision = 0
  private active = true
  private writing = false
  private listeners = new Set<() => void>()
  private readonly api: ModelMenuApi
  private readonly sessionId: string | undefined
  constructor(api: ModelMenuApi, sessionId?: string) { this.api = api; this.sessionId = sessionId }

  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  activate() { this.active = true }
  deactivate() {
    this.active = false
    this.revision++
    this.update({ loading: false, submitting: null })
  }

  async refresh(): Promise<void> {
    if (!this.active || this.writing) return
    const revision = ++this.revision
    this.update({ loading: true, error: null })
    try {
      const config = await this.api.load(this.sessionId)
      if (this.current(revision)) this.update({ config })
    } catch (error) {
      if (this.current(revision)) this.update({ error: String(error instanceof Error ? error.message : error) })
    } finally {
      if (this.current(revision)) this.update({ loading: false })
    }
  }

  async select(option: RuntimeModelOption, target?: ModelSelectionTarget): Promise<boolean> {
    if (!this.active || this.writing) return false
    if (option.selected) return true
    const revision = ++this.revision
    this.writing = true
    this.update({ submitting: option.id, loading: false, error: null })
    try {
      const config = await this.api.save(option.aiEntityId, this.sessionId, target)
      if (!this.current(revision)) return false
      this.update({ config })
      return true
    } catch (error) {
      if (this.current(revision)) this.update({ error: String(error instanceof Error ? error.message : error) })
      return false
    } finally {
      this.writing = false
      if (this.current(revision)) this.update({ submitting: null })
      else if (this.active) void this.refresh()
    }
  }

  private current(revision: number) { return this.active && revision === this.revision }
  private update(patch: Partial<ModelMenuState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
}
