const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")

const RUNTIME_ORIGINS = ["mon", "local"]

function normalizeOrigin(origin) {
  if (origin === "mon" || origin === "local") return origin
  throw new TypeError(`Unsupported Eden Agent runtime origin: ${String(origin)}`)
}

function createRustServerManager({ app, agentRoot, processObject = process, fileSystem = fs, pathApi, spawnProcess = spawn, getRuntimeEnvironment = () => ({}) } = {}) {
  if (!app?.getPath) throw new TypeError("app.getPath is required")
  const effectivePathApi = pathApi ?? (processObject.platform === "win32" ? path.win32 : path)
  const children = { mon: null, local: null }
  const serverMode = processObject.env.EDEN_AGENT_SERVER_MODE?.trim().toLowerCase()
  const configuredExternalOrigins = new Set(
    String(processObject.env.EDEN_AGENT_EXTERNAL_ORIGINS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => RUNTIME_ORIGINS.includes(value)),
  )
  // Process lifetime and runtime ownership are separate contracts. A desktop
  // may be tied to a development parent while still owning the local realm.
  if (serverMode === "external") {
    for (const origin of RUNTIME_ORIGINS) configuredExternalOrigins.add(origin)
  }
  const externallyManaged = (origin) => configuredExternalOrigins.has(normalizeOrigin(origin))
  const ports = {
    mon: Number(processObject.env.EDEN_AGENT_MON_PORT || processObject.env.EDEN_AGENT_SERVER_PORT || 40092),
    local: Number(processObject.env.EDEN_AGENT_LOCAL_PORT || 40093),
  }
  const configuredTokens = {
    mon: processObject.env.EDEN_AGENT_MON_CAPABILITY_TOKEN?.trim()
      || processObject.env.EDEN_AGENT_CAPABILITY_TOKEN?.trim(),
    local: processObject.env.EDEN_AGENT_LOCAL_CAPABILITY_TOKEN?.trim(),
  }
  const managedTokens = Object.fromEntries(RUNTIME_ORIGINS.map((origin) => [
    origin,
    configuredTokens[origin] || (externallyManaged(origin) ? null : crypto.randomBytes(32).toString("hex")),
  ]))

  function realmDataRoot(origin) {
    const realm = normalizeOrigin(origin)
    if (externallyManaged(realm)) return effectivePathApi.join(agentRoot, "Data", "realms", realm)
    return effectivePathApi.join(app.getPath("userData"), "server", "realms", realm)
  }

  function tokenFilePath(origin) {
    const realm = normalizeOrigin(origin)
    const configured = processObject.env[realm === "mon" ? "EDEN_AGENT_MON_TOKEN_FILE" : "EDEN_AGENT_LOCAL_TOKEN_FILE"]?.trim()
      || (realm === "mon" ? processObject.env.EDEN_AGENT_TOKEN_FILE?.trim() : "")
    if (configured) return effectivePathApi.resolve(agentRoot, configured)
    return effectivePathApi.join(realmDataRoot(realm), "capability.token")
  }

  function capabilityToken(origin) {
    const realm = normalizeOrigin(origin)
    if (configuredTokens[realm]) return configuredTokens[realm]
    if (managedTokens[realm]) return managedTokens[realm]
    const tokenFile = tokenFilePath(realm)
    let token
    try {
      token = fileSystem.readFileSync(tokenFile, "utf8").trim()
    } catch (error) {
      throw new Error(`Externally managed Eden Agent ${realm} capability token is not ready: ${tokenFile}`, { cause: error })
    }
    if (token.length < 32) {
      throw new Error(`Externally managed Eden Agent ${realm} capability token is invalid: ${tokenFile}`)
    }
    return token
  }

  function capability(origin = "mon") {
    const realm = normalizeOrigin(origin)
    return {
      token: capabilityToken(realm),
      origin: realm,
      baseUrl: `http://127.0.0.1:${ports[realm]}`,
    }
  }

  function executablePath() {
    const configured = processObject.env.EDEN_AGENT_SERVER_PATH?.trim()
    if (configured) return configured
    const name = processObject.platform === "win32" ? "eden-agent-server.exe" : "eden-agent-server"
    if (app.isPackaged) return effectivePathApi.join(processObject.resourcesPath, name)
    return effectivePathApi.join(agentRoot, "target", "debug", name)
  }

  function copyIfMissing(source, target) {
    if (!fileSystem.existsSync(source) || fileSystem.existsSync(target)) return false
    fileSystem.mkdirSync(effectivePathApi.dirname(target), { recursive: true })
    if (typeof fileSystem.cpSync === "function") {
      fileSystem.cpSync(source, target, { recursive: true, errorOnExist: false })
    } else if (typeof fileSystem.copyFileSync === "function") {
      fileSystem.copyFileSync(source, target)
    } else {
      return false
    }
    return true
  }

  function prepareRealmData() {
    const legacyRoot = effectivePathApi.join(app.getPath("userData"), "server")
    for (const origin of RUNTIME_ORIGINS) {
      if (externallyManaged(origin)) continue
      const targetRoot = realmDataRoot(origin)
      fileSystem.mkdirSync(targetRoot, { recursive: true })
      for (const suffix of ["", "-wal", "-shm"]) {
        copyIfMissing(
          effectivePathApi.join(legacyRoot, `eden-agent.db${suffix}`),
          effectivePathApi.join(targetRoot, `eden-agent.db${suffix}`),
        )
      }
      for (const directory of ["blobs", "plugins", "skills", "connectors", "agents"]) {
        copyIfMissing(effectivePathApi.join(legacyRoot, directory), effectivePathApi.join(targetRoot, directory))
      }
      if (origin === "local") {
        copyIfMissing(
          effectivePathApi.join(legacyRoot, "local-runtime.json"),
          effectivePathApi.join(targetRoot, "local-runtime.json"),
        )
      }
      const migrationComplete = effectivePathApi.join(targetRoot, ".realm-migration-complete")
      const migrationMarker = effectivePathApi.join(targetRoot, ".realm-migration-pending")
      if (fileSystem.existsSync(effectivePathApi.join(legacyRoot, "eden-agent.db"))
          && !fileSystem.existsSync(migrationComplete)
          && typeof fileSystem.writeFileSync === "function") {
        fileSystem.writeFileSync(migrationMarker, `${origin}\n`, { mode: 0o600 })
      }
    }
  }

  function realmEnvironment(origin) {
    const realm = normalizeOrigin(origin)
    const dataRoot = realmDataRoot(realm)
    const localRuntimeEnvironment = getRuntimeEnvironment(processObject.env)
    const environment = {
      ...processObject.env,
      ...(realm === "local" ? localRuntimeEnvironment : {}),
      EDEN_AGENT_BIND: `127.0.0.1:${ports[realm]}`,
      EDEN_AGENT_RUNTIME_ORIGIN: realm,
      EDEN_AGENT_CAPABILITY_TOKEN: capabilityToken(realm),
      EDEN_AGENT_DATABASE: effectivePathApi.join(dataRoot, "eden-agent.db"),
      EDEN_AGENT_BLOB_ROOT: effectivePathApi.join(dataRoot, "blobs"),
      EDEN_AGENT_LOG_DIRECTORY: effectivePathApi.join(dataRoot, "logs"),
      EDEN_AGENT_TOKEN_FILE: tokenFilePath(realm),
      EDEN_AGENT_PLUGIN_ROOT: effectivePathApi.join(dataRoot, "plugins"),
      EDEN_AGENT_SKILL_ROOTS: app.isPackaged
        ? effectivePathApi.join(processObject.resourcesPath, "skills", "builtin")
        : `${effectivePathApi.join(agentRoot, "Server", "skills", "builtin")},${effectivePathApi.join(agentRoot, ".agents", "skills")}`,
      EDEN_AGENT_SKILL_INSTALL_ROOT: effectivePathApi.join(dataRoot, "skills"),
      EDEN_AGENT_CONNECTOR_PACKAGE_ROOT: effectivePathApi.join(dataRoot, "connectors", "packages"),
      EDEN_AGENT_CONNECTOR_DATA_ROOT: effectivePathApi.join(dataRoot, "connectors", "runtime"),
      EDEN_AGENT_USER_AGENT_ROOT: effectivePathApi.join(dataRoot, "agents"),
      EDEN_AGENT_REALM_MIGRATION_MARKER: effectivePathApi.join(dataRoot, ".realm-migration-pending"),
    }
    if (app.isPackaged) {
      environment.EDEN_AGENT_CONNECTOR_MANIFEST_ROOT = effectivePathApi.join(processObject.resourcesPath, "manifests")
      environment.EDEN_AGENT_ALLOWED_ORIGINS = processObject.env.EDEN_AGENT_ALLOWED_ORIGINS?.trim()
        || "file://,null,edenagent://app"
    }
    if (realm === "mon") {
      for (const key of Object.keys(localRuntimeEnvironment)) delete environment[key]
      delete environment.OPENAI_API_KEY
      delete environment.OPENAI_BASE_URL
    }
    if (realm === "local") {
      delete environment.MON_CORE_BASE_URL
      delete environment.MON_CORE_TOKEN
      environment.EDEN_AGENT_LEGACY_CORE_DATABASE = effectivePathApi.join(dataRoot, "no-legacy-core.db")
    }
    return environment
  }

  function startRealm(origin) {
    const realm = normalizeOrigin(origin)
    if (children[realm] || externallyManaged(realm)) return children[realm]
    const executable = executablePath()
    if (!fileSystem.existsSync(executable)) throw new Error(`Rust server executable not found: ${executable}`)
    fileSystem.mkdirSync(realmDataRoot(realm), { recursive: true })
    const child = spawnProcess(executable, [], {
      cwd: agentRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: realmEnvironment(realm),
    })
    children[realm] = child
    child.stdout?.on("data", (chunk) => processObject.stdout?.write?.(`[rust-server:${realm}] ${chunk}`))
    child.stderr?.on("data", (chunk) => processObject.stderr?.write?.(`[rust-server:${realm}] ${chunk}`))
    child.once("exit", () => {
      if (children[realm] === child) children[realm] = null
    })
    return child
  }

  function start(origin) {
    prepareRealmData()
    if (origin) return startRealm(origin)
    return RUNTIME_ORIGINS.map(startRealm)
  }

  function stopRealm(origin) {
    const realm = normalizeOrigin(origin)
    const child = children[realm]
    if (!child) return false
    child.kill("SIGTERM")
    children[realm] = null
    return true
  }

  function stop(origin) {
    if (origin) return stopRealm(origin)
    return RUNTIME_ORIGINS.map(stopRealm).some(Boolean)
  }

  async function restart(origin = "local") {
    const realm = normalizeOrigin(origin)
    if (externallyManaged(realm)) return { restarted: false, externallyManaged: true, origin: realm }
    const previous = children[realm]
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
      if (children[realm] === previous) children[realm] = null
    }
    startRealm(realm)
    return { restarted: true, externallyManaged: false, origin: realm }
  }

  function status(origin = "local") {
    const realm = normalizeOrigin(origin)
    const external = externallyManaged(realm)
    return {
      origin: realm,
      externallyManaged: external,
      managed: !external,
      running: external ? null : Boolean(children[realm]),
      restartSupported: !external,
    }
  }

  return { capability, executablePath, prepareRealmData, restart, start, status, stop }
}

module.exports = { RUNTIME_ORIGINS, createRustServerManager, normalizeOrigin }
