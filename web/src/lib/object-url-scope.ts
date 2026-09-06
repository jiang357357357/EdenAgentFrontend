// Each consumer owns its URLs until playback and replay references are discarded.
// Disposing also prevents an in-flight fetch from creating an orphaned URL.
export class ObjectUrlScope {
  private disposed = false
  private readonly pending = new Map<string, Promise<string>>()
  private readonly urls = new Set<string>()
  private readonly controller = new AbortController()

  resolve(key: string, load: (signal: AbortSignal) => Promise<Blob>): Promise<string> {
    if (this.disposed) return Promise.reject(new DOMException("Audio scope disposed", "AbortError"))
    const existing = this.pending.get(key)
    if (existing) return existing
    const pending = Promise.resolve().then(async () => {
      if (this.disposed) throw new DOMException("Audio scope disposed", "AbortError")
      const blob = await load(this.controller.signal)
      if (this.disposed) throw new DOMException("Audio scope disposed", "AbortError")
      const url = URL.createObjectURL(blob)
      this.urls.add(url)
      return url
    }).catch((error) => {
      this.pending.delete(key)
      throw error
    })
    this.pending.set(key, pending)
    return pending
  }

  dispose(): void {
    this.disposed = true
    this.controller.abort()
    for (const url of this.urls) URL.revokeObjectURL(url)
    this.urls.clear()
    this.pending.clear()
  }
}
