export function isRuntimeSessionRunning(status: string) {
  return status === "busy" || status === "retry"
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
