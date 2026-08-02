const fs = require("node:fs")
const path = require("node:path")

function createPetSettingsStore({ filePath, defaults, normalize, fileSystem = fs, pathApi = path } = {}) {
  if (!filePath) throw new TypeError("filePath is required")
  if (!defaults || typeof defaults !== "object") throw new TypeError("defaults are required")
  if (typeof normalize !== "function") throw new TypeError("normalize is required")

  function read() {
    try {
      const raw = fileSystem.readFileSync(filePath, "utf8")
      return normalize({ ...defaults, ...JSON.parse(raw) })
    } catch {
      return { ...defaults }
    }
  }

  function write(settings) {
    fileSystem.mkdirSync(pathApi.dirname(filePath), { recursive: true })
    fileSystem.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf8")
  }

  return { read, write }
}

module.exports = { createPetSettingsStore }
