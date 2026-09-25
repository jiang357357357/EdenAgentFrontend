import { useEffect, useRef, useState } from "react"
import { resolveRuntimeBlobUrl, rpcRequestForOrigin, uploadRuntimeBlob } from "./rpc-transport"
import { getRuntimeOriginRevision } from "./runtime-origin"
import { ObjectUrlScope } from "./object-url-scope"

type Origin = "mon" | "local"
type PreferenceScope = { origin: Origin; revision: number; live: boolean; sequence: number; pending: Promise<void> }
export interface BackgroundPreference {
  opacity: number
  blur: number
  imageBlobId: string | null
}

const initial: BackgroundPreference = { opacity: 100, blur: 0, imageBlobId: null }

export function useBackgroundPreference(origin: Origin | null, active: boolean, accountIdentity?: string | number) {
  const [value, setValue] = useState<BackgroundPreference>(initial)
  const [ready, setReady] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>()
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const latestValue = useRef<BackgroundPreference>(initial)
  const owner = useRef<PreferenceScope | null>(null)

  useEffect(() => {
    setReady(false)
    latestValue.current = initial
    setValue(initial)
    setError(undefined)
    setSaving(false)
    if (!origin || !active) return
    const scope: PreferenceScope = {
      origin,
      revision: getRuntimeOriginRevision(),
      live: true,
      sequence: 0,
      pending: Promise.resolve(),
    }
    owner.current = scope
    void rpcRequestForOrigin(origin, "ui.background.get", {}, scope.revision)
      .then((result) => {
        if (scope.live) {
          latestValue.current = result
          setValue(result)
          setReady(true)
        }
      })
      .catch((reason) => {
        if (scope.live) setError(`读取背景设置失败：${String(reason)}`)
      })
    return () => {
      scope.live = false
    }
  }, [origin, active, accountIdentity])

  useEffect(() => {
    setImageUrl(undefined)
    if (!origin || !active || !value.imageBlobId) return
    const urls = new ObjectUrlScope()
    let live = true
    void resolveRuntimeBlobUrl(value.imageBlobId, origin, urls)
      .then((url) => {
        if (live) setImageUrl(url)
      })
      .catch((reason) => {
        if (live) setError(`读取背景图片失败：${String(reason)}`)
      })
    return () => {
      live = false
      urls.dispose()
    }
  }, [origin, active, accountIdentity, value.imageBlobId])

  const change = (next: BackgroundPreference) => {
    const scope = owner.current
    if (!scope?.live) return
    latestValue.current = next
    setValue(next)
    setError(undefined)
    setSaving(true)
    const sequence = ++scope.sequence
    scope.pending = scope.pending.then(async () => {
      if (!scope.live || sequence !== scope.sequence) return
      try {
        const result = await rpcRequestForOrigin(scope.origin, "ui.background.update", next, scope.revision)
        if (scope.live && sequence === scope.sequence) {
          latestValue.current = result
          setValue(result)
          setSaving(false)
        }
      } catch (reason) {
        if (scope.live && sequence === scope.sequence) {
          setSaving(false)
          setError(`保存背景设置失败：${String(reason)}`)
        }
      }
    })
  }

  const selectImage = async (file: File) => {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"])
    if (!allowed.has(file.type)) {
      setError("请选择 JPEG、PNG、WebP、GIF 或 AVIF 图片")
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("背景图片不能超过 20 MB")
      return
    }
    const scope = owner.current
    if (!scope?.live) return
    setUploading(true)
    setError(undefined)
    try {
      const info = await uploadRuntimeBlob(file)
      if (!scope.live || owner.current !== scope) return
      change({ ...latestValue.current, imageBlobId: info.id })
    } catch (reason) {
      if (scope.live) setError(`上传背景图片失败：${String(reason)}`)
    } finally {
      if (scope.live) setUploading(false)
    }
  }

  return { value, imageUrl, ready, uploading, saving, error, change, selectImage }
}
