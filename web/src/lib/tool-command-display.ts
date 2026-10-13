import type { ToolCall } from "../types"
import { toolDataDisplay } from "./tool-data-display"

export interface ToolCommandDisplay {
  command?: string
  cwd?: string
  session_id?: string
  status?: string
  exit_code?: number
  stdout?: string
  stderr?: string
  duration_ms?: number
  truncated?: boolean
  captured_chars?: number
  rawOutput?: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function legacyDisplay(details: Record<string, unknown>): ToolCommandDisplay {
  const text = (name: string) => typeof details[name] === "string" ? details[name] as string : undefined
  return {
    command: text("command"), cwd: text("cwd"), session_id: text("session_id"), status: text("status"),
    stdout: text("stdout"), stderr: text("stderr"), exit_code: finiteNumber(details.exit_code),
    duration_ms: finiteNumber(details.duration_ms), truncated: details.truncated === true,
    captured_chars: finiteNumber(details.captured_chars),
  }
}

export function toolCommandDisplay(tool: ToolCall): ToolCommandDisplay | undefined {
  if (tool.name !== "exec_command") {
    if (!["bash", "powershell", "write_stdin"].includes(tool.name)) return undefined
    const details = record(tool.details)
    return details ? legacyDisplay(details) : undefined
  }
  if (!tool.output) return undefined
  const display = toolDataDisplay(tool.output)
  const result = display.parsed ? record(display.value) : undefined
  if (!result || typeof result.stdout !== "string" || typeof result.stderr !== "string") return undefined
  const exitCode = finiteNumber(result.exitCode)
  if (exitCode === undefined) return undefined
  return {
    stdout: result.stdout, stderr: result.stderr, exit_code: exitCode,
    truncated: result.outputTruncated === true, rawOutput: tool.output,
  }
}
