import type { PendingQuestion } from '../types'
import type { ApiEvent } from './agent-client'

type Snapshot = { request: number; revision: number }
type Change = { revision: number; value: PendingQuestion | null }

/** Replay interaction events over a query snapshot, including removals. One instance per account/world epoch. */
export class PendingQuestionSync {
  private revision = 0
  private request = 0
  private accepted = 0
  private pending = new Map<number, number>()
  private changes = new Map<string, Change>()

  begin(): Snapshot {
    const snapshot = { request: ++this.request, revision: this.revision }
    this.pending.set(snapshot.request, snapshot.revision)
    return snapshot
  }

  isLatest(snapshot: Snapshot) { return snapshot.request === this.request }

  event(event: ApiEvent) {
    if (event.type === 'question.asked' && typeof event.properties.id === 'string') {
      const question = event as Extract<ApiEvent, { type: 'question.asked' }>
      this.change(question.properties.id, question.properties)
    } else if ((event.type === 'question.replied' || event.type === 'question.rejected') && typeof event.properties.requestID === 'string') {
      this.resolved(event.properties.requestID)
    }
  }

  resolved(id: string) { this.change(id, null) }

  private change(id: string, value: PendingQuestion | null) {
    this.revision++
    if (this.pending.size) this.changes.set(id, { revision: this.revision, value })
  }

  finish(snapshot: Snapshot, questions: PendingQuestion[]): PendingQuestion[] | undefined {
    try {
      if (!this.pending.has(snapshot.request) || snapshot.request < this.accepted) return undefined
      const result = new Map(questions.map(question => [question.id, question]))
      for (const [id, change] of this.changes) if (change.revision > snapshot.revision) {
        if (change.value) result.set(id, change.value)
        else result.delete(id)
      }
      this.accepted = snapshot.request
      return [...result.values()]
    } finally { this.cancel(snapshot) }
  }

  cancel(snapshot: Snapshot) {
    this.pending.delete(snapshot.request)
    if (!this.pending.size) { this.changes.clear(); return }
    const oldest = Math.min(...this.pending.values())
    for (const [id, change] of this.changes) if (change.revision <= oldest) this.changes.delete(id)
  }
}
