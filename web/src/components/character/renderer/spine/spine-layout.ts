export interface SpineBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface SpinePlacement {
  scale: number
  x: number
  y: number
}

export type SpineFitMode = "contain" | "cover"
export type SpineLayout = "standee" | "memory-lobby"
export type SpineVerticalAlignment = "bottom" | "center"

// Memory-lobby backgrounds include a narrow safety margin around the authored
// camera frame. A small overscan keeps that margin outside the visible panel
// and matches the closer in-game composition.
export const MEMORY_LOBBY_CAMERA_SCALE = 1.08
export const MEMORY_LOBBY_CAMERA_Y_BIAS = 0.018

interface SpineAssetLayoutHint {
  layout?: SpineLayout
  enabled?: boolean
}

interface CalculateSpinePlacementOptions {
  bounds: SpineBounds
  viewportWidth: number
  viewportHeight: number
  padding: number
  assetScale?: number
  offsetX?: number
  offsetY?: number
  fit?: SpineFitMode
  verticalAlignment?: SpineVerticalAlignment
}

export function resolveSpineLayout(layout: unknown): SpineLayout | undefined {
  if (layout === "standee" || layout === "memory-lobby") return layout
  return undefined
}

export function isMemoryLobbySpineAsset(asset: SpineAssetLayoutHint | undefined): boolean {
  return resolveSpineLayout(asset?.layout) === "memory-lobby"
}

export function selectSpineAsset<T extends SpineAssetLayoutHint>(
  assets: T[] | undefined,
  legacyAsset: T | null | undefined,
  preferredLayout: SpineLayout = "standee",
): T | undefined {
  const candidates = (assets ?? []).filter((asset) => asset.enabled !== false)
  const preferred = candidates.find((asset) => resolveSpineLayout(asset.layout) === preferredLayout)
  if (preferred) return preferred
  const fallbackLayout = preferredLayout === "standee" ? "memory-lobby" : "standee"
  const fallback = candidates.find((asset) => resolveSpineLayout(asset.layout) === fallbackLayout)
  if (fallback) return fallback
  return legacyAsset?.enabled === false ? undefined : legacyAsset ?? undefined
}

export function resolveMemoryLobbyCameraSlots(metadata: Record<string, unknown> | undefined): string[] {
  const configured = metadata?.camera_slots ?? metadata?.cameraSlots
  if (Array.isArray(configured)) {
    const slots = configured
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
    if (slots.length > 0) return slots
  }

  const single = metadata?.camera_slot ?? metadata?.cameraSlot
  if (typeof single === "string" && single.trim()) return [single.trim()]
  return ["BG"]
}

export function calculateVertexBounds(vertices: ArrayLike<number>): SpineBounds | undefined {
  if (vertices.length < 2 || vertices.length % 2 !== 0) return undefined

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let index = 0; index < vertices.length; index += 2) {
    const x = vertices[index]
    const y = vertices[index + 1]
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  if (maxX <= minX || maxY <= minY) return undefined
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function calculateSpinePlacement({
  bounds,
  viewportWidth,
  viewportHeight,
  padding,
  assetScale = 1,
  offsetX = 0,
  offsetY = 0,
  fit = "contain",
  verticalAlignment = "bottom",
}: CalculateSpinePlacementOptions): SpinePlacement | undefined {
  if (
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) return undefined

  const safePadding = Math.max(0, padding)
  const availableWidth = Math.max(1, viewportWidth - safePadding * 2)
  const availableHeight = Math.max(1, viewportHeight - safePadding * 2)
  const widthScale = availableWidth / bounds.width
  const heightScale = availableHeight / bounds.height
  const viewportScale = fit === "cover" ? Math.max(widthScale, heightScale) : Math.min(widthScale, heightScale)
  const finalScale = viewportScale * Math.max(0.05, assetScale)
  const x = viewportWidth / 2 - (bounds.x + bounds.width / 2) * finalScale + offsetX
  const y = verticalAlignment === "center"
    ? viewportHeight / 2 - (bounds.y + bounds.height / 2) * finalScale + offsetY
    : viewportHeight - safePadding - (bounds.y + bounds.height) * finalScale + offsetY

  return { scale: finalScale, x, y }
}
