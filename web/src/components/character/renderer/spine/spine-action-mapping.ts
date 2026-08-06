import type { ActiveCharacterAction, CoreSpineAction } from "../../../../lib/auth"

export function actionMapping(
  activeAction?: ActiveCharacterAction,
  layout?: "standee" | "memory-lobby",
): CoreSpineAction | undefined {
  const action = activeAction?.action
  if (!action) return undefined
  const variant = layout ? action.spine_variants?.[layout] : undefined
  if (variant?.animation) return variant
  if (action.spine?.animation) return action.spine
  if (!action.spine_animation) return undefined
  return {
    animation: action.spine_animation,
    track: action.spine_track,
    loop: action.spine_loop,
    mix_ms: action.spine_mix_ms,
    sync: action.spine_sync_animations,
    reset_to_idle: action.spine_reset_to_idle,
  }
}
