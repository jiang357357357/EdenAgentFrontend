export async function cancellableSpeechRequest<T>(
  start: (requestId: string) => Promise<T>,
  cancel: (requestId: string) => Promise<unknown>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted()
  const requestId = crypto.randomUUID()
  const pending = start(requestId)
  let abort: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => {
      void cancel(requestId).catch(error => console.warn('[TTS] 取消请求未确认', error))
      reject(signal?.reason ?? new DOMException('语音合成已取消', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
  try { return await Promise.race([pending, cancelled]) }
  finally { signal?.removeEventListener('abort', abort) }
}
