import { blobInfoSchema, blobMimeSchema, type BlobInfo } from '@eden/api'

async function readMetadata(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Blob upload returned no metadata')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0, text = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 16384) throw new Error('Blob upload metadata exceeds its size limit')
      text += decoder.decode(chunk.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** Timeout/cancellation does not prove the server failed to store the upload. Never auto-retry. */
export async function uploadBlob(baseUrl: string, capabilityToken: string, content: Blob, signal?: AbortSignal): Promise<BlobInfo> {
  const base = new URL(baseUrl)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid Blob service URL')
  if (!/^[A-Za-z0-9_-]{32,}$/.test(capabilityToken)) throw new Error('Invalid Blob capability token')
  const mime = blobMimeSchema.parse(content.type || 'application/octet-stream')
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), 120000)
  const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal
  try {
    combined.throwIfAborted()
    const response = await fetch(`${base.href.replace(/\/$/, '')}/blobs`, {
      method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store', signal: combined,
      headers: { Authorization: `Bearer ${capabilityToken}`, 'Content-Type': mime }, body: content,
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new Error(`Blob upload returned HTTP ${response.status}; no attachment was accepted by this client`)
    }
    if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new Error('Blob upload returned an unexpected metadata format')
    const info = blobInfoSchema.parse(await readMetadata(response))
    if (info.byteLength !== content.size || info.mime !== mime) throw new Error('Blob upload metadata differs from the submitted attachment')
    return info
  } catch (error) {
    throw new Error('Attachment upload was not confirmed. The server may have stored it; the client will not retry automatically.', { cause: error })
  } finally { clearTimeout(timer); timeout.abort() }
}
