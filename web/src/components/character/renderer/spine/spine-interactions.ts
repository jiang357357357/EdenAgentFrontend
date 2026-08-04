export type InteractionMode = "none" | "look" | "press" | "pat" | "pinch" | "reaction"
export type InteractionZone = "eye" | "head" | "cheek" | "body"

export interface PointerInteractionState {
  mode: InteractionMode
  targetKind: "eye" | "point"
  pointerId?: number
  pressedZone?: InteractionZone
  pressedAt: number
  pressedX: number
  pressedY: number
  targetX: number
  targetY: number
  currentX: number
  currentY: number
  cooldownUntil: number
  blockedUntil: number
  lastReaction?: string
  releaseTimer?: number
}

export function initialInteractionState(): PointerInteractionState {
  return {
    mode: "none",
    targetKind: "eye",
    pressedAt: 0,
    pressedX: 0,
    pressedY: 0,
    targetX: 0,
    targetY: 0,
    currentX: 0,
    currentY: 0,
    cooldownUntil: 0,
    blockedUntil: 0,
  }
}
