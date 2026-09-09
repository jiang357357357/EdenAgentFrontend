import { useLayoutEffect, useRef, useState } from "react"
import { ObjectUrlScope } from "../../../lib/object-url-scope"
import { parseBlobReference } from "../../../lib/blob-reference"
import { resolveRuntimeBlobUrl } from "../../../lib/rpc-transport"
import { getStoredRuntimeOrigin } from "../../../lib/runtime-origin"
import type { MessageData } from "../../../types"

type File = NonNullable<MessageData["files"]>[number]

function FileDownload({ file }: { file: File }) {
  const scope = useRef<ObjectUrlScope | undefined>(undefined)
  const [state, setState] = useState("下载")
  const [generation, setGeneration] = useState(0)
  useLayoutEffect(() => {
    const owner = new ObjectUrlScope()
    scope.current = owner
    setState("下载")
    const changed = () => { owner.dispose(); scope.current = undefined; setGeneration(value => value + 1) }
    window.addEventListener("edenagent:runtime-origin-changed", changed)
    window.addEventListener("storage", changed)
    return () => {
      scope.current = undefined; owner.dispose()
      window.removeEventListener("edenagent:runtime-origin-changed", changed)
      window.removeEventListener("storage", changed)
    }
  }, [file.url, generation])
  const download = async () => {
    const owner = scope.current
    if (!owner || state === "加载中…") return
    setState("加载中…")
    try {
      const reference = parseBlobReference(file.url)
      const url = reference ? await resolveRuntimeBlobUrl(reference.id, reference.origin, owner) : file.url
      if (!/^(blob:|data:|https?:\/\/)/i.test(url)) throw new Error("Unsupported download URL")
      if (scope.current !== owner || (reference && (getStoredRuntimeOrigin() ?? "mon") !== reference.origin)) return
      const link = document.createElement("a")
      link.href = url
      link.download = (file.filename || "附件").replace(/[\\/\u0000-\u001f]/g, "_")
      link.rel = "noopener"
      document.body.append(link); link.click(); link.remove()
      setState("下载")
    } catch { if (scope.current === owner) setState("下载失败，重试") }
  }
  return <button type="button" onClick={event => { event.stopPropagation(); void download() }} className="rounded-lg border border-border px-3 py-2 text-sm text-left">
    <span className="block break-all">{file.filename || "附件"}</span><span className="text-xs text-muted-foreground">{file.mime} · {state}</span>
  </button>
}

export function AttachmentFiles({ files }: { files: MessageData["files"] }) {
  if (!files?.length) return null
  return <div className="mb-2 flex flex-wrap gap-2">{files.map((file, index) => <FileDownload key={`${file.url}:${index}`} file={file} />)}</div>
}
