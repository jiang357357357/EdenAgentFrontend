import { useEffect, useRef, useState } from "react"
import { resolveRuntimeBlobUrl, rpcRequestForOrigin, uploadRuntimeBlob } from "./rpc-transport"
import { getRuntimeOriginRevision } from "./runtime-origin"
import { ObjectUrlScope } from "./object-url-scope"

type Origin = "mon" | "local"
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
  const [error, setError] = useState<string>()
  const latestValue = useRef<BackgroundPreference>(initial)
  const owner = useRef<{ origin: Origin; revision: number; live: boolean; timer?: number } | null>(null)

  useEffect(() => {
    setReady(false)
    latestValue.current = initial
    setValue(initial)
    setError(undefined)
    if (!origin || !active) return
    const scope: { origin: Origin; revision: number; live: boolean; timer?: number } = {
      origin,
      revision: getRuntimeOriginRevision(),
      live: true,
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
      if (scope.timer !== undefined) window.clearTimeout(scope.timer)
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
    if (scope.timer !== undefined) window.clearTimeout(scope.timer)
    scope.timer = window.setTimeout(() => {
      void rpcRequestForOrigin(scope.origin, "ui.background.update", next, scope.revision)
        .then((result) => {
          if (scope.live) {
            latestValue.current = result
            setValue(result)
          }
        })
        .catch((reason) => {
          if (scope.live) setError(`保存背景设置失败：${String(reason)}`)
        })
    }, 180)
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

  return { value, imageUrl, ready, uploading, error, change, selectImage }
}
