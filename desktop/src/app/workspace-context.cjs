const fs = require("node:fs")
const path = require("node:path")

function parseMonConfigValue(contents, targetSection, targetKey) {
  let section = "default"
  for (const rawLine of String(contents || "").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1).trim().toLowerCase()
      continue
    }
    const equalsIndex = line.indexOf("=")
    if (equalsIndex < 0) continue
    const key = line.slice(0, equalsIndex).trim().toUpperCase()
    const value = line.slice(equalsIndex + 1).trim()
    if (section === targetSection.toLowerCase() && key === targetKey.toUpperCase()) return value
  }
  return undefined
}

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
    return contents.includes("MonAgent") || contents.includes("SERVICE_ID=monagent")
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
    const explicit = processObject.env.MON_AGENT_ROOT?.trim()
    if (explicit) return explicit
    return (
      findAgentRootFrom(pathApi.resolve(frontendRoot, "..")) ??
      findAgentRootFrom(pathApi.dirname(processObject.execPath)) ??
      findAgentRootFrom(processObject.cwd()) ??
      pathApi.resolve(frontendRoot, "..")
    )
  }

  const agentRoot = resolveAgentRoot()
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
      ? ["icon.ico", "icon.png", "monagent-m-icon-v2.png"]
      : ["icon.png", "monagent-m-icon-v2.png", "icon.ico"]
    for (const filename of candidates) {
      const candidate = pathApi.join(desktopAssetsDir, filename)
      if (fileSystem.existsSync(candidate)) return candidate
    }
    return undefined
  }

  function findMonRootFrom(start) {
    let current = start
    while (current && current !== pathApi.dirname(current)) {
      if (fileSystem.existsSync(pathApi.join(current, "Backend", "Server", ".monconfig"))) return current
      current = pathApi.dirname(current)
    }
    return undefined
  }

  function resolveCoreBaseUrl() {
    const explicit = processObject.env.MONCORE_CORE_BASE_URL?.trim()
    if (explicit) return explicit.replace(/\/$/, "")
    const root = findMonRootFrom(agentRoot) ?? findMonRootFrom(processObject.cwd())
    if (!root) throw new Error("未找到 Mon 工作区根目录，无法定位 Backend/Server/.monconfig")
    const configPath = pathApi.join(root, "Backend", "Server", ".monconfig")
    const contents = readText(configPath)
    if (!contents) throw new Error(`读取 MonCore 配置失败: ${configPath}`)
    const host = parseMonConfigValue(contents, "server", "HOST") ?? defaultCoreHost
    const port = Number(parseMonConfigValue(contents, "server", "PORT") ?? defaultCorePort)
    const normalizedHost = host === "0.0.0.0" || host === "::" ? defaultCoreHost : host
    return `http://${normalizedHost}:${Number.isFinite(port) ? port : defaultCorePort}`
  }

  function getDevAccount() {
    const username = getAgentConfig("auth_dev", "USERNAME", "")
    const password = getAgentConfig("auth_dev", "PASSWORD", "")
    if (!username || !password) return null
    return { username, password }
  }

  return {
    agentRoot,
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
