const fs = require("node:fs")
const path = require("node:path")
const { findMonWorkspaceRoot, parseMonConfigValue } = require("./monconfig.cjs")

function createWorkspaceContext({
  app,
  moduleDir,
  processObject = process,
  fileSystem = fs,
  pathApi = path,
  defaultCoreHost = "127.0.0.1",
  defaultCorePort = 40011,
} = {}) {
  function readText(filePath) {
    try {
      return fileSystem.readFileSync(filePath, "utf8")
    } catch {
      return ""
    }
  }

  function isAgentRoot(candidate) {
    if (!candidate) return false
    const contents = readText(pathApi.join(candidate, ".monconfig"))
    return contents.includes("Eden Agent") || contents.includes("SERVICE_ID=edenagent")
  }

  function findAgentRootFrom(start) {
    let current = start
    while (current && current !== pathApi.dirname(current)) {
      if (isAgentRoot(current)) return current
      current = pathApi.dirname(current)
    }
    return undefined
  }

  function resolveFrontendRoot() {
    if (app.isPackaged) {
      const packagedRoot = pathApi.join(processObject.resourcesPath, "app")
      if (fileSystem.existsSync(pathApi.join(packagedRoot, "web", "dist", "index.html"))) return packagedRoot
    }
    return pathApi.resolve(moduleDir, "../..")
  }

  const frontendRoot = resolveFrontendRoot()

  function resolveAgentRoot() {
    const explicit = processObject.env.EDEN_AGENT_ROOT?.trim()
    if (explicit) return explicit
    for (const start of [processObject.cwd(), pathApi.dirname(processObject.execPath), frontendRoot]) {
      const workspaceRoot = findMonWorkspaceRoot(start, { fileSystem, pathApi })
      if (!workspaceRoot) continue
      const portableAgentRoot = pathApi.join(workspaceRoot, "runtime", "agent")
      if (isAgentRoot(portableAgentRoot)) return portableAgentRoot
    }
    return (
      findAgentRootFrom(pathApi.resolve(frontendRoot, "..")) ??
      findAgentRootFrom(pathApi.dirname(processObject.execPath)) ??
      findAgentRootFrom(processObject.cwd()) ??
      pathApi.resolve(frontendRoot, "..")
    )
  }

  const agentRoot = resolveAgentRoot()
  const workspaceRoot = findMonWorkspaceRoot(agentRoot, { fileSystem, pathApi })
    ?? findMonWorkspaceRoot(processObject.cwd(), { fileSystem, pathApi })
  const desktopAssetsDir = pathApi.join(frontendRoot, "desktop", "assets")

  function getAgentConfig(section, key, fallback) {
    const contents = readText(pathApi.join(agentRoot, ".monconfig"))
    return parseMonConfigValue(contents, section, key) ?? fallback
  }

  function resolveMonConfigPath(section, key, fallback) {
    const value = getAgentConfig(section, key, fallback)
    return pathApi.isAbsolute(value) ? value : pathApi.join(agentRoot, value)
  }

  function resolveDesktopIconPath() {
    const candidates = processObject.platform === "win32"
      ? ["icon.ico", "icon.png", "eden-agent-girl-icon.png"]
      : ["icon.png", "eden-agent-girl-icon.png", "icon.ico"]
    for (const filename of candidates) {
      const candidate = pathApi.join(desktopAssetsDir, filename)
      if (fileSystem.existsSync(candidate)) return candidate
    }
    return undefined
  }

  function resolveCoreBaseUrl() {
    const explicit = processObject.env.MONCORE_CORE_BASE_URL?.trim()
    if (explicit) return explicit.replace(/\/$/, "")
    const root = findMonWorkspaceRoot(agentRoot, { fileSystem, pathApi })
      ?? findMonWorkspaceRoot(processObject.cwd(), { fileSystem, pathApi })
    if (!root) throw new Error("未找到 Eden 工作区根目录，无法定位 Core/.monconfig")
    const configCandidates = [
      pathApi.join(root, "Core", ".monconfig"),
      pathApi.join(root, "runtime", "core", ".monconfig"),
    ]
    const configPath = configCandidates.find((candidate) => fileSystem.existsSync(candidate))
    if (!configPath) {
      throw new Error(`读取 MonCore 配置失败: ${configCandidates.join(" 或 ")}`)
    }
    const contents = readText(configPath)
    if (!contents) throw new Error(`读取 MonCore 配置失败: ${configPath}`)
    const host = parseMonConfigValue(contents, "server", "HOST") ?? defaultCoreHost
    const port = Number(parseMonConfigValue(contents, "server", "PORT") ?? defaultCorePort)
    const normalizedHost = host === "0.0.0.0" || host === "::" ? defaultCoreHost : host
    return `http://${normalizedHost}:${Number.isFinite(port) ? port : defaultCorePort}`
  }

  function getDevAccount() {
    const username = processObject.env.EDEN_AGENT_DEV_USERNAME?.trim()
      || getAgentConfig("auth_dev", "USERNAME", "")
    const password = processObject.env.EDEN_AGENT_DEV_PASSWORD?.trim()
      || getAgentConfig("auth_dev", "PASSWORD", "")
    if (!username || !password) return null
    return { username, password }
  }

  return {
    agentRoot,
    workspaceRoot,
    desktopAssetsDir,
    frontendRoot,
    getAgentConfig,
    getDevAccount,
    readText,
    resolveCoreBaseUrl,
    resolveDesktopIconPath,
    resolveMonConfigPath,
    resolveWindowIcon: resolveDesktopIconPath,
  }
}

module.exports = { createWorkspaceContext, parseMonConfigValue }
