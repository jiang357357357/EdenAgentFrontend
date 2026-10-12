export interface ToolInputField {
  name: string
  label: string
  text: string
}

export type ToolInputDisplay =
  | { kind: "fields"; fields: ToolInputField[] }
  | { kind: "text"; text: string }

const fieldLabels = new Map([
  ["command", "命令"],
  ["cwd", "工作目录"],
  ["workdir", "工作目录"],
  ["path", "路径"],
  ["content", "内容"],
  ["query", "查询"],
  ["queries", "查询列表"],
])

function valueText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}

export function toolInputDisplay(input: string): ToolInputDisplay {
  try {
    // Decode JSON once; replacing escaped newlines directly would corrupt paths and scripts.
    const parsed: unknown = JSON.parse(input)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const fields = Object.entries(parsed).map(([name, value]) => ({
        name,
        label: fieldLabels.get(name) ?? name,
        text: valueText(value),
      }))
      if (fields.length) return { kind: "fields", fields }
    }
    return { kind: "text", text: valueText(parsed) }
  } catch {
    // Streaming or non-JSON input remains visible verbatim until it is complete.
    return { kind: "text", text: input }
  }
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
