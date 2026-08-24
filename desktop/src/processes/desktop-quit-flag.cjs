const fs = require("node:fs")
const path = require("node:path")

const QUIT_FLAG_ENV = "EDEN_AGENT_DESKTOP_QUIT_FLAG"
const DEV_PARENT_PID_ENV = "EDEN_AGENT_DEV_PARENT_PID"

function envValue(environment, key) {
  return typeof environment?.[key] === "string" ? environment[key].trim() : ""
}

function isDevelopmentParentPid(value) {
  if (typeof value !== "string" || value.trim() === "") return false
  const pid = Number(value)
  return Number.isSafeInteger(pid) && pid > 1
}

function createDesktopQuitFlagController({
  quitFlagPath,
  environment = process.env,
  fileSystem = fs,
  pathApi = path,
} = {}) {
  if (!quitFlagPath) throw new TypeError("quitFlagPath is required")

  const externallyManaged =
    Boolean(envValue(environment, QUIT_FLAG_ENV)) ||
    isDevelopmentParentPid(envValue(environment, DEV_PARENT_PID_ENV))

  function hasQuitFlag() {
    try {
      return fileSystem.existsSync(quitFlagPath)
    } catch {
      return false
    }
  }

  function writeQuitFlag() {
    try {
      fileSystem.mkdirSync(pathApi.dirname(quitFlagPath), { recursive: true })
      fileSystem.writeFileSync(quitFlagPath, String(Date.now()), "utf8")
      return true
    } catch {
      return false
    }
  }

  function removeQuitFlag() {
    try {
      fileSystem.rmSync(quitFlagPath, { force: true })
      return true
    } catch {
      return false
    }
  }

  function clearStaleFlagForLaunch() {
    if (externallyManaged) return false
    return removeQuitFlag()
  }

  function signalQuit() {
    if (!externallyManaged) return false
    return writeQuitFlag()
  }

  return {
    isExternallyManaged: () => externallyManaged,
    hasQuitFlag,
    writeQuitFlag,
    removeQuitFlag,
    clearStaleFlagForLaunch,
    signalQuit,
  }
}

module.exports = { createDesktopQuitFlagController, isDevelopmentParentPid }