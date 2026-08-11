import type {
  CoreAssistant,
  CoreCharacter,
  CoreCharacterCostume,
  CoreCharacterSpineAsset,
} from "../../lib/auth"
import { selectExactSpineAsset, type SpineLayout } from "./renderer/spine/spine-layout.ts"

export interface AssistantAppearanceSelection {
  costume?: CoreCharacterCostume
  costumeId?: number
  costumeKey?: string
  layout: SpineLayout
  asset?: CoreCharacterSpineAsset
}

export function enabledCharacterCostumes(character?: CoreCharacter | null) {
  return (character?.costumes ?? [])
    .filter((costume) => costume.enabled !== false)
    .sort((left, right) => (left.sort_order ?? 100) - (right.sort_order ?? 100) || left.id - right.id)
}

export function costumeLayouts(costume?: CoreCharacterCostume): SpineLayout[] {
  const layouts = new Set<SpineLayout>()
  for (const asset of costume?.spine_assets ?? []) {
    if (asset.enabled === false) continue
    if (asset.layout === "standee" || asset.layout === "memory-lobby") layouts.add(asset.layout)
  }
  return ["standee", "memory-lobby"].filter((layout): layout is SpineLayout => layouts.has(layout as SpineLayout))
}

export function resolveAssistantAppearance(
  assistant?: CoreAssistant | null,
  override?: { costumeId?: number | null; layout?: SpineLayout },
): AssistantAppearanceSelection {
  const character = assistant?.character
  const costumes = enabledCharacterCostumes(character)
  const requestedCostumeId = override?.costumeId ?? assistant?.visual_costume_id
  const costume =
    costumes.find((item) => item.id === requestedCostumeId) ??
    costumes.find((item) => item.costume_id === character?.default_costume_id) ??
    costumes.find((item) => item.is_default) ??
    costumes[0]
  const requestedLayout = override?.layout ?? assistant?.visual_layout ?? "standee"
  const layouts = costumeLayouts(costume)
  const layout = layouts.includes(requestedLayout)
    ? requestedLayout
    : layouts.includes("standee")
      ? "standee"
      : layouts[0] ?? requestedLayout
  const asset = costume?.spine_assets?.find((item) => item.enabled !== false && item.layout === layout)
    ?? selectExactSpineAsset(character?.spine_assets, costume?.costume_id, layout)

  return {
    costume,
    costumeId: costume?.id,
    costumeKey: costume?.costume_id,
    layout,
    asset,
  }
}
