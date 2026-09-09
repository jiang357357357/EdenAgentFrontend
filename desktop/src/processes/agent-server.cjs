const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")
const { stopServerChild } = require("./stop-server-child.cjs")

const RUNTIME_ORIGINS = ["mon", "local"]

function normalizeOrigin(origin) {
  if (origin === "mon" || origin === "local") return origin
  throw new TypeError(`Unsupported Eden Agent runtime origin: ${String(origin)}`)
}

function createAgentServerManager({ app, agentRoot, processObject = process, fileSystem = fs, pathApi, spawnProcess = spawn, getRuntimeEnvironment = () => ({}), stopTimeoutMs = 12000 } = {}) {
  if (!app?.getPath) throw new TypeError("app.getPath is required")
  const effectivePathApi = pathApi ?? (processObject.platform === "win32" ? path.win32 : path)
  const children = { mon: null, local: null }
  const stopping = new Map()
  const restarting = new Map()
  const failures = new Map()
  let closing = false
  const serverMode = processObject.env.EDEN_AGENT_SERVER_MODE?.trim().toLowerCase()
  const configuredExternalOrigins = new Set(
    String(processObject.env.EDEN_AGENT_EXTERNAL_ORIGINS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
  for (const origin of configuredExternalOrigins) normalizeOrigin(origin)
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
  for (const port of Object.values(ports)) if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError("Invalid Agent server port")
  if (ports.mon === ports.local) throw new TypeError("Agent worlds require different ports")
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
    if (externallyManaged(realm)) return effectivePathApi.join(agentRoot, "Data", "realms", realm, "v2")
    return effectivePathApi.join(app.getPath("userData"), "server", "realms", realm, "v2")
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
    if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
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
    const configured = processObject.env.EDEN_AGENT_NODE_PATH?.trim()
    if (configured) return effectivePathApi.resolve(agentRoot, configured)
    if (app.isPackaged) return effectivePathApi.join(processObject.resourcesPath, "node", processObject.platform === "win32" ? "node.exe" : "node")
    return processObject.execPath
  }

  function entryPath() {
    const configured = processObject.env.EDEN_AGENT_SERVER_PATH?.trim()
    if (configured) return effectivePathApi.resolve(agentRoot, configured)
    return app.isPackaged
      ? effectivePathApi.join(processObject.resourcesPath, "server", "main.mjs")
      : effectivePathApi.join(agentRoot, "dist", "server", "main.mjs")
  }

  function prepareRealmData() {
    for (const origin of RUNTIME_ORIGINS) {
      if (!externallyManaged(origin)) fileSystem.mkdirSync(realmDataRoot(origin), { recursive: true, mode: 0o700 })
    }
  }

  function realmEnvironment(origin) {
    const realm = normalizeOrigin(origin)
    const dataRoot = realmDataRoot(realm)
    const localRuntimeEnvironment = getRuntimeEnvironment(processObject.env)
    const allowed = ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "TZ", "EDEN_AGENT_ALLOWED_ORIGINS", "EDEN_AGENT_MAX_BLOB_BYTES"]
    const base = Object.fromEntries(allowed.filter(key => processObject.env[key] !== undefined).map(key => [key, processObject.env[key]]))
    const environment = {
      ...base,
      ...(realm === "local" ? localRuntimeEnvironment : {}),
      EDEN_AGENT_PORT: String(ports[realm]),
      EDEN_AGENT_RUNTIME_ORIGIN: realm,
      EDEN_AGENT_CAPABILITY_TOKEN: capabilityToken(realm),
      EDEN_AGENT_V2_DATA_ROOT: dataRoot,
    }
    // A development desktop may use Electron's executable as its Node runtime.
    if (!app.isPackaged && !processObject.env.EDEN_AGENT_NODE_PATH) environment.ELECTRON_RUN_AS_NODE = "1"
    else delete environment.ELECTRON_RUN_AS_NODE
    if (app.isPackaged) environment.EDEN_AGENT_ALLOWED_ORIGINS = processObject.env.EDEN_AGENT_ALLOWED_ORIGINS?.trim() || "edenagent://app"
    if (realm === "mon") {
      for (const key of Object.keys(localRuntimeEnvironment)) delete environment[key]
      delete environment.OPENAI_API_KEY
      delete environment.OPENAI_BASE_URL
    }
    if (realm === "local") {
      delete environment.MON_CORE_BASE_URL
      delete environment.MON_CORE_TOKEN
    }
    return environment
  }

  function startRealm(origin) {
    const realm = normalizeOrigin(origin)
    if (closing || stopping.has(realm)) throw new Error(`Agent server ${realm} is stopping`)
    if (children[realm] || externallyManaged(realm)) return children[realm]
    const executable = executablePath()
    const entry = entryPath()
    if (!executable || !fileSystem.existsSync(executable)) throw new Error(`Node runtime not found: ${executable}`)
    if (!fileSystem.existsSync(entry)) throw new Error(`TS server entry not found: ${entry}; run npm run build:server`)
    fileSystem.mkdirSync(realmDataRoot(realm), { recursive: true })
    const child = spawnProcess(executable, [entry], {
      cwd: agentRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: realmEnvironment(realm),
    })
    children[realm] = child
    failures.delete(realm)
    child.on("error", error => {
      failures.set(realm, error.message)
      if (!child.pid && children[realm] === child) children[realm] = null
      processObject.stderr?.write?.(`[agent-server:${realm}] ${error.message}\n`)
    })
    child.stdout?.on("data", (chunk) => processObject.stdout?.write?.(`[agent-server:${realm}] ${chunk}`))
    child.stderr?.on("data", (chunk) => processObject.stderr?.write?.(`[agent-server:${realm}] ${chunk}`))
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
    if (stopping.has(realm)) return stopping.get(realm)
    const child = children[realm]
    if (!child) return Promise.resolve(false)
    const pending = stopServerChild(child, stopTimeoutMs).then(() => {
      if (children[realm] === child) children[realm] = null
      return true
    }).finally(() => stopping.delete(realm))
    stopping.set(realm, pending)
    return pending
  }

  async function stop(origin) {
    if (origin) return stopRealm(origin)
    closing = true
    const results = await Promise.allSettled(RUNTIME_ORIGINS.map(stopRealm))
    const errors = results.filter(result => result.status === "rejected").map(result => result.reason)
    if (errors.length) throw new AggregateError(errors, "Agent server shutdown failed")
    return results.some(result => result.value)
  }

  function restart(origin = "local") {
    const realm = normalizeOrigin(origin)
    if (externallyManaged(realm)) return Promise.resolve({ restarted: false, externallyManaged: true, origin: realm })
    if (restarting.has(realm)) return restarting.get(realm)
    const pending = stopRealm(realm).then(() => {
      startRealm(realm)
      return { restarted: true, externallyManaged: false, origin: realm }
    }).finally(() => restarting.delete(realm))
    restarting.set(realm, pending)
    return pending
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
      ...(failures.has(realm) ? { error: failures.get(realm) } : {}),
    }
  }

  return { capability, executablePath, entryPath, prepareRealmData, restart, start, status, stop }
}

module.exports = { RUNTIME_ORIGINS, createAgentServerManager, normalizeOrigin }
