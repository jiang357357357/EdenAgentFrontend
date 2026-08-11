import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import type { ActiveCharacterAction, CoreCharacter } from "../../../lib/auth"
import { resolveCoreAssetUrl } from "../../../lib/auth"
import {
  normalizeSpineLoadFailure,
  spineRetryDelayMs,
  type SpineLoadFailure,
} from "../../../lib/spine-load-policy"
import { CharacterStandeeImage } from "./CharacterStandeeImage"
import { resolveSpineLayout, selectExactSpineAsset, selectSpineAsset, type SpineLayout } from "./spine/spine-layout"

const LazySpineCharacterCanvas = lazy(() =>
  import("./spine/SpineCharacterCanvas").then((module) => ({ default: module.SpineCharacterCanvas })),
)

interface CharacterVisualRendererProps {
  character: CoreCharacter
  activeAction?: ActiveCharacterAction
  displayName: string
  globalPointerEnabled?: boolean
  className?: string
  preferredSpineLayout?: SpineLayout
  preferredCostumeId?: string | null
  strictSpineSelection?: boolean
  renderQuality?: "default" | "preview"
  onReady?: () => void
}

interface SpineRecoveryState {
  spineKey: string
  generation: number
  failureCount: number
  failure?: SpineLoadFailure
  retryAt?: number
}

const INITIAL_RECOVERY_STATE: SpineRecoveryState = {
  spineKey: "",
  generation: 0,
  failureCount: 0,
}

export function CharacterVisualRenderer({
  character,
  activeAction,
  displayName,
  globalPointerEnabled = false,
  className,
  preferredSpineLayout = "standee",
  preferredCostumeId,
  strictSpineSelection = false,
  renderQuality = "default",
  onReady,
}: CharacterVisualRendererProps) {
  const activeActionImage =
    activeAction?.imageUrl ||
    activeAction?.action?.static_image_url ||
    activeAction?.action?.dynamic_preview_url ||
    activeAction?.action?.dynamic_frames?.[0]?.file_url
  const fallbackImage = resolveCoreAssetUrl(activeActionImage || character.default_standing_image_url)
  const activeActionLabel = activeAction?.action?.name || activeAction?.action?.action_label || activeAction?.action?.intent
  const costumeId = preferredCostumeId ?? character.default_costume_id
  const costumeAsset = character.costumes
    ?.find((costume) => costume.enabled !== false && costume.costume_id === costumeId)
    ?.spine_assets
    ?.find((asset) => asset.enabled !== false && asset.layout === preferredSpineLayout)
  const spineAsset = character.visual_preference === "spine"
    ? costumeAsset ?? (
        strictSpineSelection
          ? selectExactSpineAsset(character.spine_assets, costumeId, preferredSpineLayout)
          : selectSpineAsset(
            character.spine_assets,
            character.spine_asset,
            preferredSpineLayout,
            costumeId,
          )
      )
    : undefined
  const spineKey = useMemo(() => spineAsset
    ? `${spineAsset.id ?? "spine"}:${spineAsset.skeleton_url}:${spineAsset.atlas_url}`
    : "", [spineAsset])
  const [recovery, setRecovery] = useState<SpineRecoveryState>(INITIAL_RECOVERY_STATE)
  const currentFailure = recovery.spineKey === spineKey ? recovery.failure : undefined

  useEffect(() => {
    setRecovery((current) => current.spineKey && current.spineKey !== spineKey
      ? { ...INITIAL_RECOVERY_STATE, spineKey }
      : current)
  }, [spineKey])

  useEffect(() => {
    if (recovery.spineKey !== spineKey || !recovery.failure?.retryable || !recovery.retryAt) return
    const retry = () => {
      setRecovery((current) => {
        if (current.spineKey !== spineKey || !current.failure?.retryable) return current
        return {
          ...current,
          generation: current.generation + 1,
          failure: undefined,
          retryAt: undefined,
        }
      })
    }
    const timer = window.setTimeout(retry, Math.max(0, recovery.retryAt - Date.now()))
    const handleOnline = () => retry()
    window.addEventListener("online", handleOnline)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("online", handleOnline)
    }
  }, [recovery.failure?.retryable, recovery.retryAt, recovery.spineKey, spineKey])

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

  if (!spineAsset || !resolveSpineLayout(spineAsset.layout) || currentFailure) return renderFallback()

  return (
    <Suspense fallback={null}>
      <LazySpineCharacterCanvas
        key={`${spineKey}:${recovery.spineKey === spineKey ? recovery.generation : 0}`}
        asset={spineAsset}
        activeAction={activeAction}
        renderQuality={renderQuality}
        globalPointerEnabled={globalPointerEnabled}
        className={className ?? "relative h-full w-full"}
        onReady={onReady}
        onError={(error) => {
          const failure = normalizeSpineLoadFailure(error)
          if (failure.code === "aborted") return
          setRecovery((current) => {
            const failureCount = current.spineKey === spineKey ? current.failureCount + 1 : 1
            const retryDelay = failure.retryable ? spineRetryDelayMs(failureCount) : undefined
            console.error(
              `[SpineRenderer] code=${failure.code} retryable=${failure.retryable} attempt=${failureCount}` +
              `${retryDelay === undefined ? "" : ` retryInMs=${retryDelay}`}: ${failure.message}`,
              error,
            )
            return {
              spineKey,
              generation: current.spineKey === spineKey ? current.generation : 0,
              failureCount,
              failure,
              retryAt: retryDelay === undefined ? undefined : Date.now() + retryDelay,
            }
          })
        }}
      />
    </Suspense>
  )
}
