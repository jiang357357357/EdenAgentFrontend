import { uploadBlob } from './blob-upload'
import { getStoredRuntimeOrigin, RUNTIME_ORIGIN_STORAGE_KEY, type RuntimeOrigin } from './runtime-origin'
import type { PromptAttachment } from '../types'

export async function uploadAttachmentBatch(attachments: Array<PromptAttachment | string>, origin: RuntimeOrigin,
  baseUrl: string, token: () => Promise<string>, signal?: AbortSignal) {
  const controller = new AbortController()
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  const checkWorld = () => {
    if ((getStoredRuntimeOrigin() ?? 'mon') !== origin) controller.abort(new Error('World changed while uploading attachments'))
  }
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === RUNTIME_ORIGIN_STORAGE_KEY) checkWorld() }
  window.addEventListener('edenagent:runtime-origin-changed', checkWorld)
  window.addEventListener('storage', storage)
  const timer = setTimeout(() => controller.abort(new Error('Attachment batch timed out; upload results may be unconfirmed')), 120000)
  try {
    checkWorld(); combined.throwIfAborted()
    if (!attachments.length) return []
    const capability = await token()
    combined.throwIfAborted()
    const result: { blobId: string; mime: string; filename?: string }[] = []
    for (let offset = 0; offset < attachments.length; offset += 4) {
      const pending = attachments.slice(offset, offset + 4).map(async attachment => {
        try {
          combined.throwIfAborted()
          const item = typeof attachment === 'string' ? { url: attachment, mime: 'image/png', filename: 'image.png' } : attachment
          const response = await fetch(item.url, { signal: combined })
          if (!response.ok) throw new Error(`Unable to read attachment: ${response.status}`)
          const source = await response.blob()
          checkWorld(); combined.throwIfAborted()
          const blob = source.type ? source : new Blob([source], { type: item.mime || 'application/octet-stream' })
          const info = await uploadBlob(baseUrl, capability, blob, combined)
          checkWorld(); combined.throwIfAborted()
          return { blobId: info.id, mime: info.mime, ...(item.filename ? { filename: item.filename } : {}) }
        } catch (error) { controller.abort(error); throw error }
      })
      // Drain the cancelled siblings before releasing the world listener or returning failure.
      const settled = await Promise.allSettled(pending)
      const failure = settled.find(item => item.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
      for (const item of settled) if (item.status === 'fulfilled') result.push(item.value)
    }
    return result
  } finally {
    clearTimeout(timer); controller.abort()
    window.removeEventListener('edenagent:runtime-origin-changed', checkWorld)
    window.removeEventListener('storage', storage)
  }
}
