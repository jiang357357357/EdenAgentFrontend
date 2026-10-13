import { toolDataDisplay, toolFieldLabel } from "./tool-data-display"

export interface ToolInputField {
  name: string
  label: string
  text: string
}

export type ToolInputDisplay =
  | { kind: "fields"; fields: ToolInputField[] }
  | { kind: "text"; text: string }

function valueText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}

export function toolInputDisplay(input: string): ToolInputDisplay {
  const display = toolDataDisplay(input)
  if (display.parsed === false) return { kind: "text", text: display.text }
  const parsed = display.value
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const fields = Object.entries(parsed).map(([name, value]) => ({
      name, label: toolFieldLabel(name), text: valueText(value),
    }))
    if (fields.length) return { kind: "fields", fields }
  }
  return { kind: "text", text: valueText(parsed) }
}

function compactPreview(text: string): string {
  return text.slice(0, 240).replace(/\s+/g, " ").trim()
}

export function toolInputPreview(input: string): string {
  const display = toolInputDisplay(input)
  if (display.kind === "text") return compactPreview(display.text)
  const field = display.fields.find(({ name }) => name === "command") ?? display.fields[0]
  if (field.name === "command") return compactPreview(field.text)
  return `${field.label}: ${compactPreview(field.text)}`
}
