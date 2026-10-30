import type { ApiEvent } from "./agent-client"

type PinState = { pinned?: boolean; pinUpdatedAt?: number }

/** A list refresh or replay must not override a later pin/unpin decision. */
export function sessionPinState(current: PinState | undefined, pinned: boolean | undefined, updatedAt: number) {
  if (pinned === undefined || updatedAt < (current?.pinUpdatedAt ?? 0))
    return { pinned: current?.pinned ?? false, pinUpdatedAt: current?.pinUpdatedAt ?? 0 }
  return { pinned, pinUpdatedAt: updatedAt }
}

export function sessionPinEvent(event: ApiEvent) {
  if (event.type !== "session.pin_updated") return undefined
  const value = event.properties as Record<string, unknown>
  if (!value || typeof value.sessionID !== "string" || typeof value.pinned !== "boolean"
    || typeof value.pinUpdatedAt !== "number" || !Number.isSafeInteger(value.pinUpdatedAt) || value.pinUpdatedAt < 0) return undefined
  return { sessionID: value.sessionID, pinned: value.pinned, pinUpdatedAt: value.pinUpdatedAt }
}
