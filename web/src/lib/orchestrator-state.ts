import type { OrchestratorRun } from "../types"

export interface OrchestratorStateEvent {
  type: "orchestrator.started" | "orchestrator.activity" | "orchestrator.completed" | "orchestrator.failed"
  properties: {
    sessionID?: string
    orchestrationID: string
    userMessageID?: string
    eventType?: string
    toolName?: string
    attempt?: number
    phase?: string
    error?: string
    brief?: { summary?: string }
  }
}

export function localOrchestratorRun(messageID: string): OrchestratorRun {
  return {
    orchestrationID: `local:${messageID}`,
    userMessageID: messageID,
    status: "planning",
    phase: "正在理解请求",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function upsertOrchestratorRun(
  runs: OrchestratorRun[] | undefined,
  run: OrchestratorRun | undefined,
): OrchestratorRun[] {
  if (!run?.orchestrationID) return runs ?? []
  const next = [...(runs ?? [])]
  const sameTurnLocalIndex = run.userMessageID
    ? next.findIndex(
        (item) => item.userMessageID === run.userMessageID && item.orchestrationID.startsWith("local:"),
      )
    : -1
  const index = next.findIndex((item) => item.orchestrationID === run.orchestrationID)
  const replaceIndex = index >= 0 ? index : sameTurnLocalIndex
  if (replaceIndex >= 0) next[replaceIndex] = { ...next[replaceIndex], ...run }
  else next.push(run)
  return next
}

export function latestOrchestratorRun(runs: OrchestratorRun[] | undefined): OrchestratorRun | undefined {
  return (runs ?? []).reduce<OrchestratorRun | undefined>((latest, run) => {
    if (!latest) return run
    return (run.updatedAt ?? run.createdAt ?? 0) >= (latest.updatedAt ?? latest.createdAt ?? 0) ? run : latest
  }, undefined)
}

export function reduceOrchestratorRun(
  current: OrchestratorRun | undefined,
  event: OrchestratorStateEvent,
): OrchestratorRun {
  const { properties } = event
  const sameRun = current?.orchestrationID === properties.orchestrationID
  const userMessageID = properties.userMessageID ?? (sameRun ? current?.userMessageID : undefined)
  if (event.type === "orchestrator.started") {
    if (sameRun && (current?.status === "completed" || current?.status === "failed")) return current
    return {
      orchestrationID: properties.orchestrationID,
      userMessageID,
      status: "running",
      phase: properties.phase ?? "正在理解并处理请求",
      createdAt: sameRun ? current?.createdAt ?? Date.now() : Date.now(),
      updatedAt: Date.now(),
    }
  }
  if (event.type === "orchestrator.activity") {
    return {
      orchestrationID: properties.orchestrationID,
      userMessageID,
      status: "running",
      phase:
        properties.eventType === "model_retry"
          ? `模型重试${properties.attempt ? `（第 ${properties.attempt} 次）` : ""}`
          : properties.eventType === "tool_execution_start"
            ? "正在调用工具"
            : "工具执行完成",
      toolName: properties.toolName ?? current?.toolName,
      createdAt: sameRun ? current?.createdAt : Date.now(),
      updatedAt: Date.now(),
    }
  }
  if (event.type === "orchestrator.completed") {
    return {
      orchestrationID: properties.orchestrationID,
      userMessageID,
      status: "completed",
      phase: "已完成处理",
      summary: properties.brief?.summary,
      createdAt: sameRun ? current?.createdAt : Date.now(),
      updatedAt: Date.now(),
    }
  }
  return {
    orchestrationID: properties.orchestrationID,
    userMessageID,
    status: "failed",
    phase: "处理失败",
    error: properties.error,
    summary: properties.brief?.summary,
    createdAt: sameRun ? current?.createdAt : Date.now(),
    updatedAt: Date.now(),
  }
}
