const fs = require("node:fs")
const path = require("node:path")

function stripInlineComment(line) {
  let inSingleQuote = false
  let inDoubleQuote = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote
    else if (character === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote
    else if ((character === "#" || character === ";") && !inSingleQuote && !inDoubleQuote) {
      if (index === 0 || /\s/.test(line[index - 1])) return line.slice(0, index)
    }
  }
  return line
}

function parseMonConfig(contents, source = ".monconfig") {
  const data = {}
  let section = "_root"
  for (const [index, rawLine] of String(contents || "").split(/\r?\n/).entries()) {
    const line = stripInlineComment(rawLine).trim()
    if (!line) continue
    if (line.startsWith("[")) {
      const match = line.match(/^\[([^\]]+)\]$/)
      if (!match || !match[1].trim()) throw new Error(`${source}:${index + 1}: invalid section`)
      section = match[1].trim().toLowerCase()
      data[section] ??= {}
      continue
    }
    const equalsIndex = line.indexOf("=")
    if (equalsIndex < 0) throw new Error(`${source}:${index + 1}: expected KEY=VALUE`)
    const key = line.slice(0, equalsIndex).trim().toUpperCase()
    if (!key) throw new Error(`${source}:${index + 1}: empty key`)
    data[section] ??= {}
    data[section][key] = line.slice(equalsIndex + 1).trim()
  }
  return data
}

function parseMonConfigValue(contents, targetSection, targetKey) {
  return parseMonConfig(contents)[targetSection.trim().toLowerCase()]?.[targetKey.trim().toUpperCase()]
}

function findMonWorkspaceRoot(start, { fileSystem = fs, pathApi = path } = {}) {
  let current = pathApi.resolve(start)
  while (current) {
    if (
      fileSystem.existsSync(pathApi.join(current, ".monconfig")) &&
      fileSystem.existsSync(pathApi.join(current, ".monworkspace"))
    ) {
      return current
    }
    const parent = pathApi.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
  return undefined
}

module.exports = { findMonWorkspaceRoot, parseMonConfig, parseMonConfigValue }
