const fs = require("node:fs")
const path = require("node:path")

const MAX_STRING_LENGTH = 512
const MAX_LOG_BYTES = 5 * 1024 * 1024

function sanitize(value, depth = 0) {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH)
  if (depth >= 4) return "[depth-limit]"
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => sanitize(item, depth + 1))
  if (typeof value === "object") {
    const result = {}
    for (const [key, item] of Object.entries(value).slice(0, 64)) {
      result[String(key).slice(0, 96)] = sanitize(item, depth + 1)
    }
    return result
  }
  return String(value).slice(0, MAX_STRING_LENGTH)
}

function rotateIfNeeded(filePath) {
  try {
    if (fs.statSync(filePath).size < MAX_LOG_BYTES) return
    const previousPath = `${filePath}.1`
    try {
      fs.rmSync(previousPath, { force: true })
    } catch {}
    fs.renameSync(filePath, previousPath)
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
}

function createSpeechDiagnostics(filePath, options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date()
  const append = (source, event, details = {}) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      rotateIfNeeded(filePath)
      const entry = {
        timestamp: now().toISOString(),
        source: String(source || "unknown").slice(0, 64),
        event: String(event || "unknown").slice(0, 96),
        details: sanitize(details),
      }
      fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8")
      return true
    } catch (error) {
      console.warn(`[Eden Agent][Speech] unable to write diagnostics: ${error.message || error}`)
      return false
    }
  }
  return { append }
}

module.exports = { createSpeechDiagnostics, sanitize }
