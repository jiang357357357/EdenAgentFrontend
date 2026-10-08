interface MessageBudget { failures: number; stopped: boolean; chunks: Map<string, number> }
export function speechFailureRetryable(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data
    if (data && typeof data === 'object' && 'retryable' in data) return data.retryable === true
  }
  // Timeout, transport loss and generic failures have no confirmed outcome.
  return false
}
export class SpeechRetryBudget {
  private readonly messages = new Map<string, MessageBudget>()
  private message(key: string) {
    let budget = this.messages.get(key)
    if (!budget) {
      budget = { failures: 0, stopped: false, chunks: new Map() }; this.messages.set(key, budget)
      while (this.messages.size > 128) this.messages.delete(this.messages.keys().next().value!)
    }
    return budget
  }
  check(message: string, chunk: string) {
    const budget = this.message(message)
    if (budget.stopped || budget.failures >= 8 || (budget.chunks.get(chunk) ?? 0) >= 4) {
      throw new Error('本条消息的自动语音已暂停，请处理原因后手动播放。')
    }
  }
  failed(message: string, chunk: string, error: unknown) {
    const budget = this.message(message), attempts = (budget.chunks.get(chunk) ?? 0) + 1
    budget.chunks.set(chunk, attempts); budget.failures++
    if (!speechFailureRetryable(error) || attempts >= 4 || budget.failures >= 8) budget.stopped = true
  }
  reset(message: string) { this.messages.delete(message) }
}
