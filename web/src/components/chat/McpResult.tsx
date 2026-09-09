import { useEffect, useRef, useState } from 'react'
import { mcpResultViewSchema, blobInfoSchema, type McpResultView } from '@eden/api'
import { rpcRequestForOrigin, resolveRuntimeBlobUrl } from '../../lib/rpc-transport'
import { getStoredRuntimeOrigin } from '../../lib/runtime-origin'
import { ObjectUrlScope } from '../../lib/object-url-scope'
export function McpResult({ sessionId, operationId, state }: { sessionId: string; operationId: string; state: string }) {
  const [open, setOpen] = useState(false), [view, setView] = useState<McpResultView | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ url: string; kind: 'audio' | 'image' } | null>(null)
  const scope = useRef<ObjectUrlScope | null>(null), origin = getStoredRuntimeOrigin()
  useEffect(() => {
    const urls = new ObjectUrlScope(); scope.current = urls
    let active = true
    setView(null); setError(''); setBusy(false); setPreview(null)
    if (open) void rpcRequestForOrigin(origin, 'mcp.result.read', { sessionId, operationId }).then(value => {
      if (active && getStoredRuntimeOrigin() === origin) setView(mcpResultViewSchema.parse(value))
    }).catch(() => { if (active) setError('读取已保存结果失败。') })
    const changed = () => { active = false; urls.dispose(); setView(null); setPreview(null); setOpen(false) }
    window.addEventListener('edenagent:runtime-origin-changed', changed)
    return () => { active = false; urls.dispose(); if (scope.current === urls) scope.current = null; window.removeEventListener('edenagent:runtime-origin-changed', changed) }
  }, [sessionId, operationId, origin, open, state])
  async function download(index: number, display = false) {
    const urls = scope.current
    if (!urls || busy || getStoredRuntimeOrigin() !== origin) return
    setBusy(true); setError('')
    try {
      const blob = blobInfoSchema.parse(await rpcRequestForOrigin(origin, 'mcp.result.export', { sessionId, operationId, index }))
      if (scope.current !== urls || getStoredRuntimeOrigin() !== origin) return
      const url = await resolveRuntimeBlobUrl(blob.id, origin, urls)
      if (scope.current !== urls || getStoredRuntimeOrigin() !== origin) return
      if (display) {
        const kind = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4'].includes(blob.mime) ? 'audio'
          : ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(blob.mime) ? 'image' : undefined
        if (!kind) throw new Error('Unsupported media preview')
        setPreview({ url, kind }); return
      }
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `mcp-result-${index}.${blob.mime.startsWith('text/') ? 'txt' : 'bin'}`; anchor.click()
    } catch { if (scope.current === urls) setError('结果导出失败，请重试。') }
    finally { if (scope.current === urls) setBusy(false) }
  }
  return <div className="mt-2">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? '收起结果' : '查看已保存结果'}</button>
    {open && <div className="mt-2 space-y-2">
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {view && !view.parts.length && <p>此操作尚无已保存结果。</p>}
      {view?.parts.map(part => <div key={part.index} className="rounded border p-2">
        <p>{part.kind}{part.mimeType ? ` · ${part.mimeType}` : ''}</p>
        {part.text !== null && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{part.text}</pre>}
        {part.truncated && <p className="text-xs text-stone-500">预览已截断，可下载完整内容。</p>}
        <button type="button" disabled={busy} onClick={() => void download(part.index)}>下载内容</button>
        {part.binary && part.mimeType && /^(audio\/(wav|x-wav|mpeg|ogg|webm|mp4)|image\/(png|jpeg|gif|webp))$/.test(part.mimeType)
          && <button type="button" className="ml-3" disabled={busy} onClick={() => void download(part.index, true)}>预览媒体</button>}
      </div>)}
      {preview?.kind === 'audio' && <audio controls src={preview.url} preload="metadata" />}
      {preview?.kind === 'image' && <img src={preview.url} alt="MCP 返回图片" className="max-h-96 max-w-full object-contain" />}
    </div>}
  </div>
}
