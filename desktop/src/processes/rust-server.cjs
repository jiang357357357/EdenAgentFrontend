const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")

function createRustServerManager({ app, agentRoot, processObject = process, fileSystem = fs, pathApi, spawnProcess = spawn, getRuntimeEnvironment = () => ({}) } = {}) {
  if (!app?.getPath) throw new TypeError("app.getPath is required")
  const effectivePathApi = pathApi ?? (processObject.platform === "win32" ? path.win32 : path)
  let child = null
  const configuredToken = processObject.env.EDEN_AGENT_CAPABILITY_TOKEN?.trim()
  const serverMode = processObject.env.EDEN_AGENT_SERVER_MODE?.trim().toLowerCase()
  const externallyManaged = serverMode === "external" || Boolean(processObject.env.EDEN_AGENT_DEV_PARENT_PID)
  const managedToken = configuredToken || (externallyManaged ? null : crypto.randomBytes(32).toString("hex"))

  function externalRestartScriptPath() {
    if (processObject.platform === "win32") return null
    return effectivePathApi.join(agentRoot, "Script", "Process", "linux", "server", "restart_process.sh")
  }

  function externalRestartSupported() {
    const script = externalRestartScriptPath()
    return Boolean(script && fileSystem.existsSync(script))
  }

  function tokenFilePath() {
    const configured = processObject.env.EDEN_AGENT_TOKEN_FILE?.trim()
    if (configured) return effectivePathApi.resolve(agentRoot, configured)
    if (externallyManaged) return effectivePathApi.join(agentRoot, "Data", "server-capability.token")
    return effectivePathApi.join(app.getPath("userData"), "server", "capability.token")
  }

  function capabilityToken() {
    if (configuredToken) return configuredToken
    if (managedToken) return managedToken

    const tokenFile = tokenFilePath()
    let token
    try {
      token = fileSystem.readFileSync(tokenFile, "utf8").trim()
    } catch (error) {
      throw new Error(`Externally managed Eden Agent capability token is not ready: ${tokenFile}`, { cause: error })
    }
    if (token.length < 32) {
      throw new Error(`Externally managed Eden Agent capability token is invalid: ${tokenFile}`)
    }
    return token
  }

  function executablePath() {
    const configured = processObject.env.EDEN_AGENT_SERVER_PATH?.trim()
    if (configured) return configured
    const name = processObject.platform === "win32" ? "eden-agent-server.exe" : "eden-agent-server"
    if (app.isPackaged) return effectivePathApi.join(processObject.resourcesPath, name)
    return effectivePathApi.join(agentRoot, "target", "debug", name)
  }

  function start() {
    if (child || externallyManaged) return child
    const executable = executablePath()
    if (!fileSystem.existsSync(executable)) {
      throw new Error(`Rust server executable not found: ${executable}`)
    }
    const dataRoot = effectivePathApi.join(app.getPath("userData"), "server")
    fileSystem.mkdirSync(dataRoot, { recursive: true })
    child = spawnProcess(executable, [], {
      cwd: agentRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...processObject.env,
        ...getRuntimeEnvironment(processObject.env),
        EDEN_AGENT_CAPABILITY_TOKEN: capabilityToken(),
        EDEN_AGENT_DATABASE: effectivePathApi.join(dataRoot, "eden-agent.db"),
        EDEN_AGENT_BLOB_ROOT: effectivePathApi.join(dataRoot, "blobs"),
        EDEN_AGENT_LOG_DIRECTORY: effectivePathApi.join(dataRoot, "logs"),
        EDEN_AGENT_TOKEN_FILE: tokenFilePath(),
        EDEN_AGENT_SKILL_ROOTS: app.isPackaged
          ? effectivePathApi.join(processObject.resourcesPath, "skills", "builtin")
          : `${effectivePathApi.join(agentRoot, "Server", "skills", "builtin")},${effectivePathApi.join(agentRoot, ".agents", "skills")}`,
        EDEN_AGENT_SKILL_INSTALL_ROOT: effectivePathApi.join(dataRoot, "skills"),
      },
    })
    child.stdout?.on("data", (chunk) => processObject.stdout?.write?.(`[rust-server] ${chunk}`))
    child.stderr?.on("data", (chunk) => processObject.stderr?.write?.(`[rust-server] ${chunk}`))
    const spawned = child
    child.once("exit", () => {
      if (child === spawned) child = null
    })
    return child
  }

  function stop() {
    if (!child) return false
    child.kill("SIGTERM")
    child = null
    return true
  }

  async function restart() {
    if (externallyManaged) {
      const script = externalRestartScriptPath()
      if (!script || !externalRestartSupported()) return { restarted: false, externallyManaged: true }
      await new Promise((resolve, reject) => {
        const supervisor = spawnProcess("bash", [script], {
          cwd: agentRoot,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          env: processObject.env,
        })
        supervisor.stdout?.on("data", (chunk) => processObject.stdout?.write?.(`[server-supervisor] ${chunk}`))
        supervisor.stderr?.on("data", (chunk) => processObject.stderr?.write?.(`[server-supervisor] ${chunk}`))
        let settled = false
        const finish = (error) => {
          if (settled) return
          settled = true
          if (error) reject(error)
          else resolve()
        }
        supervisor.once("error", finish)
        supervisor.once("exit", (code, signal) => {
          if (code === 0) finish()
          else finish(new Error(`MonPM server restart failed (${signal || `exit ${code}`})`))
        })
      })
      return { restarted: true, externallyManaged: true }
    }
    const previous = child
    if (previous) {
      await new Promise((resolve) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve()
        }
        const timer = setTimeout(finish, 5000)
        previous.once("exit", finish)
        previous.kill("SIGTERM")
      })
      if (child === previous) child = null
    }
    start()
    return { restarted: true, externallyManaged: false }
  }

  function status() {
    return {
      externallyManaged,
      managed: !externallyManaged,
      running: externallyManaged ? null : Boolean(child),
      restartSupported: !externallyManaged || externalRestartSupported(),
    }
  }

  return {
    capability: () => ({ token: capabilityToken() }),
    executablePath,
    restart,
    start,
    status,
    stop,
  }
}

module.exports = { createRustServerManager }
