const path = require("node:path")

const RUNTIME_ORIGINS = new Set(["mon", "local"])

function normalizeExternalOrigins(value) {
  const origins = String(value || "mon")
    .split(",")
    .map((origin) => origin.trim().toLowerCase())
    .filter(Boolean)
  if (!origins.length || origins.some((origin) => !RUNTIME_ORIGINS.has(origin))) {
    throw new TypeError(`Unsupported externally managed Eden Agent origins: ${String(value)}`)
  }
  return [...new Set(origins)].join(",")
}

function createDesktopRuntimeEnvironment({
  environment = process.env,
  agentRoot,
  workspaceRoot,
  parentPid,
  quitFlag,
  externalOrigins,
  pathApi,
} = {}) {
  if (!agentRoot) throw new TypeError("agentRoot is required")
  const effectivePathApi = pathApi ?? (process.platform === "win32" ? path.win32 : path)
  const result = {
    ...environment,
    EDEN_AGENT_DEV_PARENT_PID: String(parentPid || environment.EDEN_AGENT_DEV_PARENT_PID || process.pid),
    EDEN_AGENT_EXTERNAL_ORIGINS: normalizeExternalOrigins(
      externalOrigins ?? environment.EDEN_AGENT_EXTERNAL_ORIGINS ?? "mon",
    ),
    EDEN_AGENT_MON_TOKEN_FILE: String(environment.EDEN_AGENT_MON_TOKEN_FILE || "").trim()
      || (workspaceRoot
        ? effectivePathApi.join(workspaceRoot, "Data", "Agent", "server-capability.token")
        : effectivePathApi.join(agentRoot, "Data", "realms", "mon", "capability.token")),
    // Realm-aware launchers must not fall back to the legacy all-external mode
    // or to one token shared by multiple runtime origins.
    EDEN_AGENT_SERVER_MODE: "",
    EDEN_AGENT_TOKEN_FILE: "",
  }
  if (quitFlag) result.EDEN_AGENT_DESKTOP_QUIT_FLAG = quitFlag
  return result
}

module.exports = { createDesktopRuntimeEnvironment, normalizeExternalOrigins }
