import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import type { ActiveCharacterAction, CoreCharacter } from "../../../lib/auth"
import { resolveCoreAssetUrl } from "../../../lib/auth"
import { CharacterStandeeImage } from "./CharacterStandeeImage"

const LazySpineCharacterCanvas = lazy(() =>
  import("./spine/SpineCharacterCanvas").then((module) => ({ default: module.SpineCharacterCanvas })),
)

interface CharacterVisualRendererProps {
  character: CoreCharacter
  activeAction?: ActiveCharacterAction
  displayName: string
  className?: string
  onReady?: () => void
}

export function CharacterVisualRenderer({
  character,
  activeAction,
  displayName,
  className,
  onReady,
}: CharacterVisualRendererProps) {
  const activeActionImage =
    activeAction?.imageUrl ||
    activeAction?.action?.static_image_url ||
    activeAction?.action?.dynamic_preview_url ||
    activeAction?.action?.dynamic_frames?.[0]?.file_url
  const fallbackImage = resolveCoreAssetUrl(activeActionImage || character.default_standing_image_url || character.avatar_url)
  const activeActionLabel = activeAction?.action?.name || activeAction?.action?.action_label || activeAction?.action?.intent
  const spineAsset = character.visual_preference === "spine" && character.spine_asset?.enabled !== false
    ? character.spine_asset
    : undefined
  const spineKey = useMemo(() => spineAsset
    ? `${spineAsset.id ?? "spine"}:${spineAsset.skeleton_url}:${spineAsset.atlas_url}`
    : "", [spineAsset])
  const [failedSpineKey, setFailedSpineKey] = useState("")

  useEffect(() => {
    if (failedSpineKey && failedSpineKey !== spineKey) setFailedSpineKey("")
  }, [failedSpineKey, spineKey])

  const renderFallback = () => fallbackImage ? (
    <CharacterStandeeImage
      src={fallbackImage}
      alt={activeActionLabel ? `${displayName} - ${activeActionLabel}` : displayName}
      className={className}
      imageClassName="h-full w-auto max-w-none object-contain object-bottom"
      onReady={onReady}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center px-[3vw] text-center text-[1.35vh] text-text-muted">
      动态角色资源加载失败，且没有可用的静态立绘。
    </div>
  )

  if (!spineAsset || failedSpineKey === spineKey) return renderFallback()

  return (
    <Suspense fallback={null}>
      <LazySpineCharacterCanvas
        asset={spineAsset}
        activeAction={activeAction}
        className={className ?? "relative h-full w-full"}
        onReady={onReady}
        onError={(error) => {
          console.error("Spine character renderer failed", error)
          setFailedSpineKey(spineKey)
        }}
      />
    </Suspense>
  )
}
