import { useLayoutEffect, useState } from "react"
import { parseBlobReference } from "../../../lib/blob-reference"
import { ObjectUrlScope } from "../../../lib/object-url-scope"
import { resolveRuntimeBlobUrl } from "../../../lib/rpc-transport"
import { resolveEdenAgentUrl } from "../../../lib/agent-client"
import { getStoredRuntimeOrigin } from "../../../lib/runtime-origin"

interface Props {
  src: string
  alt: string
  className?: string
  draggable?: boolean
  onPreview?: (url: string, alt: string) => void
}

export function AttachmentImage({ src, alt, className, draggable = false, onPreview }: Props) {
  const [loaded, setLoaded] = useState<{ source: string; url?: string; failed?: boolean }>()
  const [attempt, setAttempt] = useState(0)
  const reference = parseBlobReference(src)
  useLayoutEffect(() => {
    const ref = parseBlobReference(src)
    if (!ref) return
    setLoaded(undefined)
    const scope = new ObjectUrlScope()
    let active = true
    const changed = () => {
      if ((getStoredRuntimeOrigin() ?? "mon") === ref.origin) return
      active = false
      scope.dispose()
      setLoaded({ source: src, failed: true })
    }
    window.addEventListener("edenagent:runtime-origin-changed", changed)
    window.addEventListener("storage", changed)
    resolveRuntimeBlobUrl(ref.id, ref.origin, scope).then(url => {
      if (active) setLoaded({ source: src, url })
    }).catch(() => { if (active) setLoaded({ source: src, failed: true }) })
    return () => {
      active = false; scope.dispose()
      window.removeEventListener("edenagent:runtime-origin-changed", changed)
      window.removeEventListener("storage", changed)
    }
  }, [src, attempt])
  const current = loaded?.source === src ? loaded : undefined
  const url = reference ? current?.url : resolveEdenAgentUrl(src)
  if (!url && current?.failed) return <button type="button" className="text-xs text-muted-foreground" onClick={event => { event.stopPropagation(); setAttempt(value => value + 1) }}>附件加载失败，点击重试</button>
  if (!url) return <span role="status" className="text-xs text-muted-foreground">正在加载附件…</span>
  return <img src={url} alt={alt} className={className} draggable={draggable} onClick={event => { event.stopPropagation(); onPreview?.(url, alt) }} />
}
