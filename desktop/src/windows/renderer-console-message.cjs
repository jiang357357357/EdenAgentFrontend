function rendererConsoleDetails(event, args = []) {
  if (args[0] && typeof args[0] === "object") return args[0]
  if (event && typeof event === "object" && (event.message !== undefined || event.level !== undefined)) {
    return event
  }
  return {
    level: args[0],
    message: args[1],
    lineNumber: args[2],
    sourceId: args[3],
  }
}

function rendererConsoleError(event, args = []) {
  const details = rendererConsoleDetails(event, args)
  if (details.level !== "error" && details.level !== 3) return null
  const source = details.sourceId ? ` (${details.sourceId}:${details.lineNumber ?? 0})` : ""
  return `${details.message ?? "Unknown renderer error"}${source}`
}

module.exports = { rendererConsoleDetails, rendererConsoleError }

