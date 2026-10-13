export type ToolDataValue = string | number | boolean | null | ToolDataValue[] | { [name: string]: ToolDataValue }
export type ToolDataDisplay = { parsed: true; value: ToolDataValue } | { parsed: false; text: string }

const fieldLabels = new Map([
  ["command", "命令"], ["cwd", "工作目录"], ["workdir", "工作目录"], ["path", "路径"],
  ["content", "内容"], ["query", "查询"], ["queries", "查询列表"], ["text", "文本"],
  ["message", "消息"], ["result", "结果"], ["results", "结果列表"], ["status", "状态"],
  ["stdout", "标准输出（stdout）"], ["stderr", "标准错误（stderr）"],
  ["exitCode", "退出码"], ["exit_code", "退出码"], ["error", "错误"],
])

export function toolFieldLabel(name: string): string {
  return fieldLabels.get(name) ?? name
}

export function toolDataDisplay(text: string): ToolDataDisplay {
  try {
    // Decode only the transport JSON. Strings inside it remain strings, including literal escapes.
    return { parsed: true, value: JSON.parse(text) as ToolDataValue }
  } catch {
    return { parsed: false, text }
  }
}
