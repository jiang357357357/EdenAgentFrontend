export type ConnectionFeedbackPhase = 'idle' | 'connecting' | 'reconnecting' | 'restoring' | 'restored' | 'sync-error'

export interface ConnectionFeedbackState {
  phase: ConnectionFeedbackPhase
  revision: number
  hasConnected: boolean
  reason?: string
}

export const initialConnectionFeedback: ConnectionFeedbackState = { phase: 'connecting', revision: 0, hasConnected: false }

/** A connection being open and its session snapshots being current are separate facts. */
export class ConnectionFeedback {
  private state = initialConnectionFeedback
  private readonly changed: (state: ConnectionFeedbackState) => void
  constructor(changed: (state: ConnectionFeedbackState) => void) { this.changed = changed }

  reset(enabled = true): void {
    this.update({ phase: enabled ? 'connecting' : 'idle', revision: this.state.revision + 1, hasConnected: false })
  }

  opened(): { revision: number; recovering: boolean } {
    const recovering = this.state.hasConnected
    const revision = this.state.revision + 1
    this.update({ phase: recovering ? 'restoring' : 'idle', revision, hasConnected: true })
    return { revision, recovering }
  }

  disconnected(reason: string): void {
    this.update({ ...this.state, phase: 'reconnecting', reason, revision: this.state.revision + 1 })
  }

  synchronizing(): number {
    const revision = this.state.revision + 1
    this.update({ ...this.state, phase: 'restoring', reason: undefined, revision })
    return revision
  }

  synchronized(revision: number, error?: string): void {
    if (!this.isCurrent(revision) || this.state.phase !== 'restoring') return
    this.update({ ...this.state, phase: error !== undefined ? 'sync-error' : 'restored', reason: error })
  }

  isCurrent(revision: number): boolean { return revision === this.state.revision }

  dismiss(): void {
    if (this.state.phase === 'restored') this.update({ ...this.state, phase: 'idle', reason: undefined })
  }

  private update(state: ConnectionFeedbackState): void {
    this.state = state
    this.changed(state)
  }
}
