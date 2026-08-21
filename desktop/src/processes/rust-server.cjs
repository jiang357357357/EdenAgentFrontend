const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")

function createRustServerManager({ app, agentRoot, processObject = process, fileSystem = fs, pathApi = path, spawnProcess = spawn } = {}) {
  if (!app?.getPath) throw new TypeError("app.getPath is required")
  let child = null
  const configuredToken = processObject.env.MON_AGENT_CAPABILITY_TOKEN?.trim()
  const serverMode = processObject.env.MON_AGENT_SERVER_MODE?.trim().toLowerCase()
  const externallyManaged = serverMode === "external" || Boolean(processObject.env.MON_AGENT_DEV_PARENT_PID)
  const managedToken = configuredToken || (externallyManaged ? null : crypto.randomBytes(32).toString("hex"))

  function tokenFilePath() {
    const configured = processObject.env.MON_AGENT_TOKEN_FILE?.trim()
    if (configured) return pathApi.resolve(agentRoot, configured)
    if (externallyManaged) return pathApi.join(agentRoot, "Data", "server-capability.token")
    return pathApi.join(app.getPath("userData"), "server", "capability.token")
  }

  function capabilityToken() {
    if (configuredToken) return configuredToken
    if (managedToken) return managedToken

    const tokenFile = tokenFilePath()
    let token
    try {
      token = fileSystem.readFileSync(tokenFile, "utf8").trim()
    } catch (error) {
      throw new Error(`Externally managed MonAgent capability token is not ready: ${tokenFile}`, { cause: error })
    }
    if (token.length < 32) {
      throw new Error(`Externally managed MonAgent capability token is invalid: ${tokenFile}`)
    }
    return token
  }

  function executablePath() {
    const configured = processObject.env.MON_AGENT_SERVER_PATH?.trim()
    if (configured) return configured
    const name = processObject.platform === "win32" ? "mon-agent-server.exe" : "mon-agent-server"
    if (app.isPackaged) return pathApi.join(processObject.resourcesPath, name)
    return pathApi.join(agentRoot, "target", "debug", name)
  }

  function start() {
    if (child || externallyManaged) return child
    const executable = executablePath()
    if (!fileSystem.existsSync(executable)) {
      throw new Error(`Rust server executable not found: ${executable}`)
    }
    const dataRoot = pathApi.join(app.getPath("userData"), "server")
    fileSystem.mkdirSync(dataRoot, { recursive: true })
    child = spawnProcess(executable, [], {
      cwd: agentRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...processObject.env,
        MON_AGENT_CAPABILITY_TOKEN: capabilityToken(),
        MON_AGENT_DATABASE: pathApi.join(dataRoot, "mon-agent.db"),
        MON_AGENT_BLOB_ROOT: pathApi.join(dataRoot, "blobs"),
        MON_AGENT_LOG_DIRECTORY: pathApi.join(dataRoot, "logs"),
        MON_AGENT_TOKEN_FILE: tokenFilePath(),
        MON_AGENT_SKILL_ROOTS: app.isPackaged
          ? pathApi.join(processObject.resourcesPath, "skills", "builtin")
          : `${pathApi.join(agentRoot, "Server", "skills", "builtin")},${pathApi.join(agentRoot, ".agents", "skills")}`,
        MON_AGENT_SKILL_INSTALL_ROOT: pathApi.join(dataRoot, "skills"),
      },
    })
    child.stdout?.on("data", (chunk) => processObject.stdout?.write?.(`[rust-server] ${chunk}`))
    child.stderr?.on("data", (chunk) => processObject.stderr?.write?.(`[rust-server] ${chunk}`))
    child.once("exit", () => { child = null })
    return child
  }

  function stop() {
    if (!child) return false
    child.kill("SIGTERM")
    child = null
    return true
  }

  return {
    capability: () => ({ token: capabilityToken() }),
    executablePath,
    start,
    stop,
  }
}

module.exports = { createRustServerManager }
