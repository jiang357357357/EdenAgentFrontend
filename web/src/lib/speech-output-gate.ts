export class SpeechOutputGate {
  private revision = 0
  private pending: boolean
  private readonly onChange: (pending: boolean) => void

  constructor(initialPending: boolean, onChange: (pending: boolean) => void) {
    this.pending = initialPending
    this.onChange = onChange
  }

  get active() {
    return this.pending
  }

  begin() {
    this.revision += 1
    this.update(true)
  }

  holdUntil(queue: PromiseLike<unknown>) {
    const revision = ++this.revision
    this.update(true)
    const settle = () => {
      if (revision !== this.revision) return
      this.update(false)
    }
    void Promise.resolve(queue).then(settle, settle)
  }

  reset(pending = false) {
    this.revision += 1
    this.update(pending)
  }

  private update(pending: boolean) {
    if (this.pending === pending) return
    this.pending = pending
    this.onChange(pending)
  }
}
