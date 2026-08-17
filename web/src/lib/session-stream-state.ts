import type { SessionStatus } from "../types"

export function reconcileRuntimeSessionStatus(
  current: SessionStatus,
  hydrated?: SessionStatus,
): SessionStatus {
  return hydrated ?? current
}

export function isRuntimeSessionRunning(status: string) {
  return status === "busy" || status === "retry" || status === "stopping"
}

export function runtimePartState(sessionIsRunning: boolean, partIsIncomplete: boolean): "streaming" | "done" {
  return sessionIsRunning && partIsIncomplete ? "streaming" : "done"
}

export function isAssistantMessageStreaming(
  sessionIsRunning: boolean,
  isAssistant: boolean,
  messageIsIncomplete: boolean,
) {
  return sessionIsRunning && isAssistant && messageIsIncomplete
}
