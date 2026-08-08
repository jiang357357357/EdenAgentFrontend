import type { ToolCall } from "../types"

export interface PetDialogSegmentInput {
  speaker?: unknown
  text?: unknown
  speechSegmentId?: unknown
  speechMessageId?: unknown
  runtimeTrace?: unknown
  thinking?: unknown
  tool?: Partial<ToolCall> | Record<string, unknown> | null
}

export interface PetDialogSegment {
  speaker: string
  text?: string
  speechSegmentId?: string
  speechMessageId?: string
  runtimeTrace?: string
  thinking?: string
  tool?: ToolCall
}

export function petDialogValueText(value: unknown): string {
  if (typeof value === "string") return value
  if (value === null || value === undefined) return ""
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value)
  }
  try {
    const serialized = JSON.stringify(value, null, 2)
    return serialized === undefined ? String(value) : serialized
  } catch {
    try {
      return String(value)
    } catch {
      return "[unrenderable value]"
    }
  }
}

function optionalText(value: unknown) {
  const text = petDialogValueText(value)
  return text || undefined
}

function normalizeTool(value: PetDialogSegmentInput["tool"]): ToolCall | undefined {
  if (!value || typeof value !== "object") return undefined
  const tool = value as Record<string, unknown>
  const rawStatus = tool.status
  const status: ToolCall["status"] = rawStatus === "success" || rawStatus === "error" || rawStatus === "aborted" ? rawStatus : "running"
  const duration = typeof tool.duration === "number" && Number.isFinite(tool.duration)
    ? tool.duration
    : undefined

  return {
    id: petDialogValueText(tool.id) || "unknown-tool",
    name: petDialogValueText(tool.name) || "tool",
    status,
    input: petDialogValueText(tool.input),
    output: optionalText(tool.output),
    error: optionalText(tool.error),
    errorCode: optionalText(tool.errorCode),
    retryable: typeof tool.retryable === "boolean" ? tool.retryable : undefined,
    duration,
  }
}

export function normalizePetDialogSegments(segments: readonly PetDialogSegmentInput[]): PetDialogSegment[] {
  if (!Array.isArray(segments)) return []
  return segments.map((segment) => ({
    speaker: petDialogValueText(segment?.speaker),
    text: optionalText(segment?.text),
    speechSegmentId: optionalText(segment?.speechSegmentId),
    speechMessageId: optionalText(segment?.speechMessageId),
    runtimeTrace: optionalText(segment?.runtimeTrace),
    thinking: optionalText(segment?.thinking),
    tool: normalizeTool(segment?.tool),
  }))
}
