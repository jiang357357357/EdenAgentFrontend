function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

export type SelfAwakeToolExecution = {
  id: string
  name: string
  status: "running" | "succeeded" | "failed"
  result: string
  args?: unknown
  rawResult?: unknown
}

function compactResult(value: unknown) {
  if (value === null || value === undefined || value === "") return "未返回结果"
  const text = typeof value === "string" ? value : JSON.stringify(value)
  const normalized = text.replace(/\s+/g, " ").trim()
  return normalized.length > 180 ? `${normalized.slice(0, 180)}…` : normalized
}

// Execution records are generated from persisted tool events and redacted by the
// server. Pair start/end events instead of reconstructing facts from old desktop
// activity snapshots that are no longer part of the privacy-minimal request.
export function selfAwakeToolExecutions(value: unknown): SelfAwakeToolExecution[] {
  const events = Array.isArray(record(value).events) ? record(value).events as unknown[] : []
  const calls = new Map<string, SelfAwakeToolExecution>()
  for (const item of events) {
    const event = record(item)
    const payload = record(event.payload)
    const eventType = String(event.kind ?? event.eventType ?? event.event_type ?? "")
    const id = String(payload.toolCallId ?? payload.tool_call_id ?? "")
    if (!id) continue
    if (eventType === "agent.tool_execution_start") {
      calls.set(id, {
        id,
        name: String(payload.toolName ?? payload.tool_name ?? "未知工具"),
        args: payload.args ?? payload.arguments,
        status: "running",
        result: "执行中",
      })
    } else if (eventType === "agent.tool_execution_end") {
      const existing = calls.get(id) ?? { id, name: "未知工具", status: "running" as const, result: "执行中" }
      const failed = payload.isError === true || payload.is_error === true
      calls.set(id, {
        ...existing,
        status: failed ? "failed" : "succeeded",
        rawResult: payload.result ?? payload.output ?? payload.error,
        result: compactResult(payload.result ?? payload.output ?? payload.error),
      })
    }
  }
  return [...calls.values()]
}

export function selfAwakeObservations(value: unknown): string[] {
  const observations = record(value).observations
  return Array.isArray(observations)
    ? observations.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : []
}
