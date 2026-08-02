import type { Spine, TrackEntry } from "@esotericsoftware/spine-pixi-v7"

import type { ActiveCharacterAction, CoreSpineAction } from "../../../../lib/auth"
import { shouldLoopSpineAction, type SpineInteractionAnimations } from "../../../../lib/spine-interactions"

function clearEntryWhenComplete(spine: Spine, track: number, entry: TrackEntry, mixSeconds = 0.12) {
  entry.listener = {
    complete: (completed) => {
      if (spine.state.getCurrent(track) === completed) {
        spine.state.setEmptyAnimation(track, mixSeconds)
      }
    },
  }
}

export function playLayeredInteraction(spine: Spine, main?: string, aux?: string, loop = true) {
  if (!main) return false
  const mixSeconds = 0.12
  spine.state.data.defaultMix = mixSeconds
  const mainEntry = spine.state.setAnimation(1, main, loop)
  if (!loop) clearEntryWhenComplete(spine, 1, mainEntry, mixSeconds)
  if (aux) {
    const auxEntry = spine.state.setAnimation(2, aux, loop)
    if (!loop) clearEntryWhenComplete(spine, 2, auxEntry, mixSeconds)
  } else {
    spine.state.setEmptyAnimation(2, mixSeconds)
  }
  return true
}

export function interactionTrackAvailable(spine: Spine, animations: SpineInteractionAnimations) {
  const current = spine.state.getCurrent(1)
  if (!current) return true
  const name = current.animation?.name ?? ""
  return !name || name.startsWith("<") || animations.all.has(name)
}

export function actionMapping(activeAction?: ActiveCharacterAction): CoreSpineAction | undefined {
  const action = activeAction?.action
  if (!action) return undefined
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

export function playMappedAction(
  spine: Spine,
  availableAnimations: Set<string>,
  idleAnimation: string,
  mapping?: CoreSpineAction,
) {
  for (let track = 1; track <= 15; track += 1) spine.state.clearTrack(track)
  if (!mapping?.animation || !availableAnimations.has(mapping.animation)) return

  const track = Math.max(0, Math.min(15, mapping.track ?? 1))
  const loop = shouldLoopSpineAction(mapping)
  const mixSeconds = Math.max(0, Math.min(10, mapping.mix_ms ?? 180)) / 1000
  spine.state.data.defaultMix = mixSeconds
  const entry = spine.state.setAnimation(track, mapping.animation, loop)

  if (!loop && mapping.reset_to_idle !== false) {
    entry.listener = {
      complete: (completed) => {
        if (spine.state.getCurrent(track) !== completed) return
        if (track === 0 && idleAnimation && availableAnimations.has(idleAnimation)) {
          spine.state.setAnimation(0, idleAnimation, true)
        } else {
          spine.state.setEmptyAnimation(track, mixSeconds)
        }
      },
    }
  }

  for (const sync of mapping.sync ?? []) {
    if (!sync.animation || !availableAnimations.has(sync.animation)) continue
    const syncTrack = Math.max(0, Math.min(15, sync.track ?? 2))
    if (syncTrack === track) continue
    const syncEntry = spine.state.setAnimation(syncTrack, sync.animation, Boolean(sync.loop))
    if (!sync.loop) clearEntryWhenComplete(spine, syncTrack, syncEntry, mixSeconds)
  }
}
