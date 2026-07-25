const { app, BrowserWindow, Menu, Tray, desktopCapturer, dialog, ipcMain, nativeImage, powerMonitor, protocol, screen, net, session, shell } = require("electron")
const { execFile, spawn } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const { fileURLToPath, pathToFileURL } = require("node:url")
const { promisify } = require("node:util")
const { isInternalAppUrl, isSupportedExternalUrl } = require("./navigation-policy.cjs")

const execFileAsync = promisify(execFile)

const APP_WINDOW_TITLE = "MonAgent — AI 个人助手"
const DEFAULT_CORE_HOST = "127.0.0.1"
const DEFAULT_CORE_PORT = 40011
const DEFAULT_WEB_PORT = 40091
const SETTINGS_WINDOW_WIDTH_RATIO = 1
const SETTINGS_WINDOW_HEIGHT_RATIO = 1
const MIN_PET_CHARACTER_HEIGHT = 120

const frontendRoot = resolveFrontendRoot()
const agentRoot = resolveAgentRoot()
const desktopAssetsDir = path.join(frontendRoot, "desktop", "assets")
const quitFlag =
  process.env.MON_AGENT_DESKTOP_QUIT_FLAG?.trim() ||
  resolveMonConfigPath("desktop", "QUIT_FLAG", ".artifacts/desktop-quit.flag")
const petSettingsPath = resolveMonConfigPath("desktop", "PET_SETTINGS", ".artifacts/desktop-pet-settings.json")
const DEFAULT_PET_SETTINGS = {
  alwaysOnTop: true,
  transparentWindow: true,
  clickThrough: false,
  characterDraggable: false,
  showInput: true,
  voiceInputEnabled: true,
  ttsMode: "none",
  petScale: 100,
  inputOpacity: 78,
  dock: "center",
  inputMode: "compact",
  inputWidth: 78,
  inputHeight: 20,
  inputFontScale: 100,
  windowX: null,
  windowY: null,
}
let mainWindow = null
let petWindow = null
let petBubbleWindow = null
let settingsWindow = null
let tray = null
let isQuitting = false
let currentViewMode = "chatWithCharacter"
let petSettings = readPetSettings()
let applyingPetBounds = false
let savePetPositionTimer = null
let petBubbleCollapsed = false
let desktopEnvironmentBroadcastTimer = null
const desktopEnvironmentMonitors = []
let devParentWatchTimer = null
let activityPresenceToken = ""
let activityPresenceClientId = ""
let activityPresenceHeartbeatTimer = null
let activityPresencePublishInFlight = false
let activityPresencePublishQueued = false
let systemSuspended = false
const rendererActivityFacts = new Map()
const recentActivityEvents = []
let authSession = null
let authVerification = null
const AUTH_VERIFICATION_TTL_MS = 30_000

function broadcastAuthState(state) {
  for (const targetWindow of BrowserWindow.getAllWindows()) {
    if (!targetWindow.isDestroyed()) targetWindow.webContents.send("mon-agent-auth-state", state)
  }
}

function setAuthSession(token, response) {
  authSession = token && response?.valid !== false ? { token, response, verifiedAt: Date.now() } : null
  broadcastAuthState(authSession
    ? { type: "authenticated", token: authSession.token, response: authSession.response }
    : { type: "unauthenticated" })
}

function isOutputPipeError(error) {
  return error?.code === "EPIPE" || error?.code === "ERR_STREAM_DESTROYED"
}

function handleOutputError(error) {
  if (!isOutputPipeError(error)) {
    setImmediate(() => { throw error })
    return
  }
  if (!isQuitting) {
    isQuitting = true
    app.quit()
  }
}

process.stdout.on("error", handleOutputError)
process.stderr.on("error", handleOutputError)

function startDevParentWatch() {
  const parentPid = Number(process.env.MON_AGENT_DEV_PARENT_PID)
  if (!Number.isSafeInteger(parentPid) || parentPid <= 1) return
  devParentWatchTimer = setInterval(() => {
    try {
      process.kill(parentPid, 0)
    } catch {
      clearInterval(devParentWatchTimer)
      devParentWatchTimer = null
      if (!isQuitting) {
        isQuitting = true
        app.quit()
      }
    }
  }, 750)
  devParentWatchTimer.unref?.()
}

app.setName("MonAgent")
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")
if (process.platform === "win32") {
  app.setAppUserModelId("com.mon.monagent")
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "monagent-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch {
    return ""
  }
}

function isAgentRoot(candidate) {
  if (!candidate) return false
  const configPath = path.join(candidate, ".monconfig")
  const contents = readText(configPath)
  return contents.includes("MonAgent") || contents.includes("SERVICE_ID=monagent")
}

function findAgentRootFrom(start) {
  let current = start
  while (current && current !== path.dirname(current)) {
    if (isAgentRoot(current)) return current
    current = path.dirname(current)
  }
  return undefined
}

function resolveFrontendRoot() {
  if (app.isPackaged) {
    const packagedRoot = path.join(process.resourcesPath, "app")
    if (fs.existsSync(path.join(packagedRoot, "web", "dist", "index.html"))) {
      return packagedRoot
    }
  }
  return path.resolve(__dirname, "../..")
}

function resolveAgentRoot() {
  const explicit = process.env.MON_AGENT_ROOT?.trim()
  if (explicit) return explicit
  return (
    findAgentRootFrom(path.resolve(frontendRoot, "..")) ??
    findAgentRootFrom(path.dirname(process.execPath)) ??
    findAgentRootFrom(process.cwd()) ??
    path.resolve(frontendRoot, "..")
  )
}

function parseMonConfigValue(contents, targetSection, targetKey) {
  let section = "default"
  for (const rawLine of contents.split(/\r?\n/)) {
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
    if (section === targetSection.toLowerCase() && key === targetKey.toUpperCase()) {
      return value
    }
  }
  return undefined
}

function readAgentConfig() {
  return readText(path.join(agentRoot, ".monconfig"))
}

function getAgentConfig(section, key, fallback) {
  return parseMonConfigValue(readAgentConfig(), section, key) ?? fallback
}

function resolveMonConfigPath(section, key, fallback) {
  const value = getAgentConfig(section, key, fallback)
  return path.isAbsolute(value) ? value : path.join(agentRoot, value)
}

function resolveDesktopIconPath() {
  const candidates = process.platform === "win32"
    ? ["icon.ico", "icon.png", "monagent-m-icon-v2.png"]
    : ["icon.png", "monagent-m-icon-v2.png", "icon.ico"]
  for (const filename of candidates) {
    const candidate = path.join(desktopAssetsDir, filename)
    if (fs.existsSync(candidate)) return candidate
  }
  return undefined
}

function resolveWindowIcon() {
  const iconPath = resolveDesktopIconPath()
  return iconPath && fs.existsSync(iconPath) ? iconPath : undefined
}

function createDesktopIcon() {
  const iconPath = resolveDesktopIconPath()
  if (iconPath) {
    const icon = nativeImage.createFromPath(iconPath)
    if (!icon.isEmpty()) {
      return process.platform === "linux" ? icon.resize({ width: 24, height: 24 }) : icon
    }
  }
  return createFallbackTrayIcon()
}

function findMonRootFrom(start) {
  let current = start
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "Backend", "Server", ".monconfig"))) {
      return current
    }
    current = path.dirname(current)
  }
  return undefined
}

function findMonRoot() {
  return findMonRootFrom(agentRoot) ?? findMonRootFrom(process.cwd())
}

function resolveCoreBaseUrl() {
  const explicit = process.env.MONCORE_CORE_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, "")

  const root = findMonRoot()
  if (!root) {
    throw new Error("未找到 Mon 工作区根目录，无法定位 Backend/Server/.monconfig")
  }

  const configPath = path.join(root, "Backend", "Server", ".monconfig")
  const contents = readText(configPath)
  if (!contents) {
    throw new Error(`读取 MonCore 配置失败: ${configPath}`)
  }

  const host = parseMonConfigValue(contents, "server", "HOST") ?? DEFAULT_CORE_HOST
  const port = Number(parseMonConfigValue(contents, "server", "PORT") ?? DEFAULT_CORE_PORT)
  const normalizedHost = host === "0.0.0.0" || host === "::" ? DEFAULT_CORE_HOST : host
  return `http://${normalizedHost}:${Number.isFinite(port) ? port : DEFAULT_CORE_PORT}`
}

function getDevAccount() {
  const username = getAgentConfig("auth_dev", "USERNAME", "")
  const password = getAgentConfig("auth_dev", "PASSWORD", "")
  if (!username || !password) return null
  return { username, password }
}

async function parseCoreError(response) {
  const status = response.status
  const text = await response.text().catch(() => "")
  try {
    const data = JSON.parse(text)
    return data.error || data.message || `${status} ${response.statusText}`
  } catch {
    return text || `${status} ${response.statusText}`
  }
}

async function coreRequest(endpoint, init = {}) {
  const baseUrl = resolveCoreBaseUrl()
  const started = Date.now()
  const response = await fetch(`${baseUrl}${endpoint}`, init).catch((error) => {
    console.error(`[MonAgent][CoreBridge][ERROR] ${init.method ?? "GET"} ${endpoint} failed: ${error}`)
    throw new Error(`请求 MonCore 接口失败: ${error.message || error}`)
  })

  console.log(
    `[MonAgent][CoreBridge][INFO] ${init.method ?? "GET"} ${endpoint} -> ${response.status} ${Date.now() - started}ms`,
  )

  if (!response.ok) {
    const error = new Error(await parseCoreError(response))
    error.status = response.status
    throw error
  }

  return response.json()
}

function authHeader(token) {
  return { Authorization: `Token ${token}` }
}

async function verifyCoreTokenOnce(token, clientId) {
  const normalizedToken = String(token || "").trim()
  if (!normalizedToken) return { valid: false }
  if (authSession?.token === normalizedToken && Date.now() - authSession.verifiedAt < AUTH_VERIFICATION_TTL_MS) {
    return authSession.response
  }
  if (authVerification?.token === normalizedToken) return authVerification.promise

  const promise = coreRequest("/api/users/verify-token/", {
    method: "GET",
    headers: authHeader(normalizedToken),
  }).then((response) => {
    if (response?.valid) {
      setAuthSession(normalizedToken, response)
      startActivityPresence(normalizedToken, clientId)
    } else {
      setAuthSession(null, null)
    }
    return response
  }).catch((error) => {
    if (error?.status === 401 || error?.status === 403) setAuthSession(null, null)
    throw error
  }).finally(() => {
    if (authVerification?.promise === promise) authVerification = null
  })
  authVerification = { token: normalizedToken, promise }
  return promise
}

function recordActivityEvent(type, details = {}) {
  recentActivityEvents.push({ type, occurred_at: new Date().toISOString(), ...details })
  if (recentActivityEvents.length > 20) recentActivityEvents.splice(0, recentActivityEvents.length - 20)
}

function attachWindowActivityEvents(targetWindow, surface) {
  const webContentsId = targetWindow.webContents.id
  targetWindow.on("focus", () => {
    recordActivityEvent("window_focused", { surface })
    void publishActivityPresence()
  })
  targetWindow.on("blur", () => {
    recordActivityEvent("window_blurred", { surface })
    void publishActivityPresence()
  })
  targetWindow.on("show", () => void publishActivityPresence())
  targetWindow.on("hide", () => void publishActivityPresence())
  targetWindow.webContents.on("destroyed", () => {
    rendererActivityFacts.delete(webContentsId)
    void publishActivityPresence()
  })
}

function quotedXPropertyValues(text) {
  return Array.from(String(text || "").matchAll(/"([^"]*)"/g), (match) => match[1])
}

async function readForegroundWindowFacts() {
  if (process.platform !== "linux") {
    return {
      available: false,
      application_name: null,
      process_name: null,
      window_title: null,
      fullscreen: null,
      error: `当前平台 ${process.platform} 尚未接入活动窗口采集器`,
    }
  }
  if (String(process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland") {
    return {
      available: false,
      application_name: null,
      process_name: null,
      window_title: null,
      fullscreen: null,
      error: "当前 Wayland 会话没有通用活动窗口接口",
    }
  }

  try {
    const root = await execFileAsync("xprop", ["-root", "_NET_ACTIVE_WINDOW"], { timeout: 1500 })
    const windowId = String(root.stdout || "").match(/0x[0-9a-f]+/i)?.[0]
    if (!windowId || windowId === "0x0") throw new Error("系统没有报告活动窗口")
    const detail = await execFileAsync(
      "xprop",
      ["-id", windowId, "_NET_WM_PID", "WM_CLASS", "_NET_WM_NAME", "WM_NAME", "_NET_WM_STATE"],
      { timeout: 1500 },
    )
    const output = String(detail.stdout || "")
    const pid = Number(output.match(/_NET_WM_PID\(CARDINAL\)\s*=\s*(\d+)/)?.[1])
    const wmClassLine = output.split(/\r?\n/).find((line) => line.startsWith("WM_CLASS")) || ""
    const windowNameLine = output.split(/\r?\n/).find((line) => line.startsWith("_NET_WM_NAME"))
      || output.split(/\r?\n/).find((line) => line.startsWith("WM_NAME"))
      || ""
    const applicationName = quotedXPropertyValues(wmClassLine).at(-1) || null
    const windowTitle = quotedXPropertyValues(windowNameLine).at(-1) || null
    let processName = null
    if (Number.isSafeInteger(pid) && pid > 0) {
      processName = readText(`/proc/${pid}/comm`).trim() || null
    }
    return {
      available: true,
      application_name: applicationName,
      process_name: processName,
      window_title: windowTitle,
      fullscreen: output.includes("_NET_WM_STATE_FULLSCREEN"),
      error: "",
    }
  } catch (error) {
    return {
      available: false,
      application_name: null,
      process_name: null,
      window_title: null,
      fullscreen: null,
      error: String(error?.message || error),
    }
  }
}

function combinedRendererActivityFacts() {
  const facts = Array.from(rendererActivityFacts.values())
  const latestInteraction = facts
    .map((item) => String(item.last_user_interaction_at || ""))
    .filter(Boolean)
    .sort()
    .at(-1) || null
  return {
    chat_input_focused: facts.some((item) => item.chat_input_focused === true),
    voice_recording: facts.some((item) => item.voice_recording === true),
    tts_playing: facts.some((item) => item.tts_playing === true),
    last_user_interaction_at: latestInteraction,
  }
}

async function collectActivityPresenceFacts() {
  const foregroundWindow = await readForegroundWindowFacts()
  const collectionErrors = []
  if (foregroundWindow.error) collectionErrors.push(`foreground_window: ${foregroundWindow.error}`)
  let idleSeconds = null
  let sessionLocked = null
  try {
    idleSeconds = powerMonitor.getSystemIdleTime()
    sessionLocked = powerMonitor.getSystemIdleState(1) === "locked"
  } catch (error) {
    collectionErrors.push(`system_input: ${String(error?.message || error)}`)
  }
  const rendererFacts = combinedRendererActivityFacts()
  return {
    captured_at: new Date().toISOString(),
    system_input: {
      idle_seconds: idleSeconds,
    },
    session: {
      locked: sessionLocked,
      suspended: systemSuspended,
      display_on: null,
      screen_saver_running: null,
      do_not_disturb: null,
    },
    foreground_window: foregroundWindow,
    media: {
      available: false,
      audio_playing: null,
      microphone_in_use: null,
      camera_in_use: null,
      error: "系统媒体会话采集器尚未接入",
    },
    monagent: {
      main_window_visible: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()),
      main_window_focused: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()),
      pet_visible: Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible()),
      bubble_visible: Boolean(petBubbleWindow && !petBubbleWindow.isDestroyed() && petBubbleWindow.isVisible()),
      settings_window_visible: Boolean(settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()),
      current_view_mode: currentViewMode,
      ...rendererFacts,
    },
    recent_events: recentActivityEvents.slice(-12),
    sources: {
      system_input: "electron.powerMonitor",
      session: "electron.powerMonitor",
      foreground_window: process.platform === "linux" ? "linux.x11.xprop" : `electron.${process.platform}`,
      monagent: "electron",
      media: "unavailable",
    },
    collection_errors: collectionErrors,
  }
}

async function publishActivityPresence() {
  if (!activityPresenceToken || isQuitting) return false
  if (activityPresencePublishInFlight) {
    activityPresencePublishQueued = true
    return false
  }
  activityPresencePublishInFlight = true
  try {
    const payload = await collectActivityPresenceFacts()
    await coreRequest("/api/users/me/activity-presence/", {
      method: "PUT",
      headers: {
        ...authHeader(activityPresenceToken),
        "content-type": "application/json",
        ...(activityPresenceClientId ? { "X-MON-CLIENT-ID": activityPresenceClientId } : {}),
      },
      body: JSON.stringify(payload),
    })
    return true
  } catch (error) {
    if (!isQuitting) console.warn(`[MonAgent][ActivityPresence][WARN] 上报失败: ${error?.message || error}`)
    return false
  } finally {
    activityPresencePublishInFlight = false
    if (activityPresencePublishQueued) {
      activityPresencePublishQueued = false
      setTimeout(() => void publishActivityPresence(), 250)
    }
  }
}

function startActivityPresence(token, clientId = "") {
  activityPresenceToken = String(token || "")
  activityPresenceClientId = String(clientId || "")
  if (activityPresenceHeartbeatTimer) clearInterval(activityPresenceHeartbeatTimer)
  activityPresenceHeartbeatTimer = setInterval(() => void publishActivityPresence(), 60_000)
  activityPresenceHeartbeatTimer.unref?.()
  void publishActivityPresence()
}

function stopActivityPresence() {
  activityPresenceToken = ""
  activityPresenceClientId = ""
  if (activityPresenceHeartbeatTimer) clearInterval(activityPresenceHeartbeatTimer)
  activityPresenceHeartbeatTimer = null
}

function updateRendererActivityFacts(webContents, input) {
  if (!webContents || webContents.isDestroyed()) return false
  const previous = rendererActivityFacts.get(webContents.id) || {}
  const next = { ...previous }
  for (const key of ["chat_input_focused", "voice_recording", "tts_playing"]) {
    if (typeof input?.[key] === "boolean") next[key] = input[key]
  }
  if (typeof input?.last_user_interaction_at === "string") {
    next.last_user_interaction_at = input.last_user_interaction_at
  }
  rendererActivityFacts.set(webContents.id, next)
  recordActivityEvent("monagent_interaction_updated", {
    surface: String(input?.surface || "unknown"),
    changed_fields: Object.keys(input || {}).filter((key) => key !== "surface"),
  })
  void publishActivityPresence()
  return true
}

function startActivityPresenceSystemEvents() {
  powerMonitor.on("suspend", () => {
    systemSuspended = true
    recordActivityEvent("system_suspended")
    void publishActivityPresence()
  })
  powerMonitor.on("resume", () => {
    systemSuspended = false
    recordActivityEvent("system_resumed")
    void publishActivityPresence()
  })
  powerMonitor.on("lock-screen", () => {
    recordActivityEvent("session_locked")
    void publishActivityPresence()
  })
  powerMonitor.on("unlock-screen", () => {
    recordActivityEvent("session_unlocked")
    void publishActivityPresence()
  })
}

function jsonPost(body) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }
}

function clamp(value, min, max) {
  const withMin = typeof min === "number" ? Math.max(value, min) : value
  return typeof max === "number" ? Math.min(withMin, max) : withMin
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return clamp(number, min, max)
}

function normalizePetSettings(input = {}) {
  const windowX = Number(input.windowX)
  const windowY = Number(input.windowY)
  const characterDraggable = Boolean(input.characterDraggable ?? DEFAULT_PET_SETTINGS.characterDraggable)
  const showInput = Boolean(input.showInput ?? DEFAULT_PET_SETTINGS.showInput)
  const clickThrough = !characterDraggable && Boolean(input.clickThrough ?? DEFAULT_PET_SETTINGS.clickThrough)
  const legacyTTSMode = input.speechSynthesisEnabled === true ? "text_only" : "none"
  const ttsMode = ["none", "text_only", "all"].includes(input.ttsMode)
    ? input.ttsMode
    : legacyTTSMode
  return {
    alwaysOnTop: Boolean(input.alwaysOnTop ?? DEFAULT_PET_SETTINGS.alwaysOnTop),
    transparentWindow: Boolean(input.transparentWindow ?? DEFAULT_PET_SETTINGS.transparentWindow),
    clickThrough,
    characterDraggable,
    showInput,
    voiceInputEnabled: Boolean(input.voiceInputEnabled ?? DEFAULT_PET_SETTINGS.voiceInputEnabled),
    ttsMode,
    petScale: clampNumber(input.petScale, DEFAULT_PET_SETTINGS.petScale, 70, 140),
    inputOpacity: clampNumber(input.inputOpacity, DEFAULT_PET_SETTINGS.inputOpacity, 30, 100),
    dock: ["left", "center", "right"].includes(input.dock) ? input.dock : DEFAULT_PET_SETTINGS.dock,
    inputMode: ["compact", "panel", "hidden"].includes(input.inputMode) ? input.inputMode : DEFAULT_PET_SETTINGS.inputMode,
    inputWidth: clampNumber(input.inputWidth, DEFAULT_PET_SETTINGS.inputWidth, 10, 100),
    inputHeight: clampNumber(input.inputHeight, DEFAULT_PET_SETTINGS.inputHeight, 12, 32),
    inputFontScale: clampNumber(input.inputFontScale, DEFAULT_PET_SETTINGS.inputFontScale, 70, 140),
    windowX: Number.isFinite(windowX) ? windowX : null,
    windowY: Number.isFinite(windowY) ? windowY : null,
  }
}

function readPetSettings() {
  try {
    const raw = fs.readFileSync(petSettingsPath, "utf8")
    return normalizePetSettings({ ...DEFAULT_PET_SETTINGS, ...JSON.parse(raw) })
  } catch {
    return { ...DEFAULT_PET_SETTINGS }
  }
}

function writePetSettings(settings) {
  fs.mkdirSync(path.dirname(petSettingsPath), { recursive: true })
  fs.writeFileSync(petSettingsPath, JSON.stringify(settings, null, 2), "utf8")
}

function petCoordinate(value) {
  if (value === null || value === undefined || value === "") return null
  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? Math.round(coordinate) : null
}

function displayForPetSettings(fallbackWindow) {
  const storedX = petCoordinate(petSettings.windowX)
  const storedY = petCoordinate(petSettings.windowY)
  if (storedX !== null && storedY !== null) return screen.getDisplayNearestPoint({ x: storedX, y: storedY })
  if (petWindow && !petWindow.isDestroyed()) return screen.getDisplayMatching(petWindow.getBounds())
  if (fallbackWindow && !fallbackWindow.isDestroyed()) return screen.getDisplayMatching(fallbackWindow.getBounds())
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

function petInteractionRatio() {
  if (!petSettings.showInput) return 0
  return clamp((petSettings.inputHeight + 16) / 100, 0.28, 0.5)
}

function petWindowBounds() {
  const storedX = petCoordinate(petSettings.windowX)
  const storedY = petCoordinate(petSettings.windowY)
  const display = displayForPetSettings()
  const workArea = display.workArea
  const scale = petSettings.petScale / 100
  const characterHeight = Math.round(clamp(workArea.height * 0.5 * scale, MIN_PET_CHARACTER_HEIGHT, workArea.height))
  const inputRatio = petInteractionRatio()
  const layoutGapRatio = petSettings.showInput ? 0.04 : 0
  const height = Math.round(characterHeight / Math.max(0.12, 1 - inputRatio - layoutGapRatio))
  const width = Math.round(height * (7 / 16))
  const margin = 16
  const fallbackX =
    petSettings.dock === "left"
      ? workArea.x + margin
      : petSettings.dock === "right"
        ? workArea.x + workArea.width - width - margin
        : workArea.x + Math.round((workArea.width - width) / 2)
  const fallbackY = workArea.y + workArea.height - height - margin
  const x = storedX ?? fallbackX
  const y = storedY ?? fallbackY
  return { x, y, width, height }
}

function petWindowLayout() {
  const group = petWindowBounds()
  const inputRatio = petInteractionRatio()
  const layoutGapRatio = petSettings.showInput ? 0.04 : 0
  const characterOffset = Math.round(group.height * (inputRatio + layoutGapRatio))
  const character = {
    x: group.x,
    y: group.y + characterOffset,
    width: group.width,
    height: Math.max(1, group.height - characterOffset),
  }
  const expandedWidth = Math.max(1, Math.round(group.width * (petSettings.inputWidth / 100)))
  const expandedHeight = Math.max(1, Math.round(group.height * inputRatio))
  const expandedBubble = {
    x: group.x + Math.round((group.width - expandedWidth) / 2),
    y: group.y,
    width: expandedWidth,
    height: expandedHeight,
  }
  const buttonSize = Math.max(32, Math.round(group.height * 0.06))
  const collapsedBubble = {
    x: group.x,
    y: character.y - buttonSize - Math.round(group.height * 0.02),
    width: buttonSize,
    height: buttonSize,
  }
  return { group, character, expandedBubble, collapsedBubble, characterOffset }
}

function applyPetWindowAttributes() {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setAlwaysOnTop(petSettings.alwaysOnTop)
    petWindow.setIgnoreMouseEvents(petSettings.clickThrough)
    petWindow.setOpacity(1)
    petWindow.setBackgroundColor(petSettings.transparentWindow ? "#00000000" : "#f5f5f4")
    petWindow.setHasShadow(!petSettings.transparentWindow)
  }
  if (petBubbleWindow && !petBubbleWindow.isDestroyed()) {
    petBubbleWindow.setSkipTaskbar(true)
    petBubbleWindow.setAlwaysOnTop(petSettings.alwaysOnTop)
    petBubbleWindow.setIgnoreMouseEvents(false)
    petBubbleWindow.setOpacity(1)
    petBubbleWindow.setBackgroundColor("#00000000")
    petBubbleWindow.setHasShadow(false)
  }
}

function applyPetBubbleBounds() {
  if (!petBubbleWindow || petBubbleWindow.isDestroyed()) return
  const layout = petWindowLayout()
  petBubbleWindow.setBounds(petBubbleCollapsed ? layout.collapsedBubble : layout.expandedBubble, false)
}

function applyPetBubbleVisibility() {
  if (!petBubbleWindow || petBubbleWindow.isDestroyed()) return
  const characterVisible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible())
  if (characterVisible && petSettings.showInput) {
    petBubbleWindow.setSkipTaskbar(true)
    petBubbleWindow.showInactive()
    if (petSettings.alwaysOnTop) petBubbleWindow.moveTop()
  } else {
    petBubbleWindow.hide()
  }
}

function applyPetWindowBounds() {
  if (!petWindow || petWindow.isDestroyed()) return

  const layout = petWindowLayout()
  petWindow.setMinimumSize(1, 1)
  petWindow.setMaximumSize(100000, 100000)
  applyingPetBounds = true
  petWindow.setBounds(layout.character, false)
  applyPetBubbleBounds()
  setTimeout(() => {
    applyingPetBounds = false
  }, 250)
}

function applyPetWindowSettings() {
  applyPetWindowAttributes()
  applyPetWindowBounds()
  applyPetBubbleVisibility()
}

function savePetWindowPosition() {
  if (!petWindow || applyingPetBounds) return
  const bounds = petWindow.getBounds()
  const layout = petWindowLayout()
  petSettings = normalizePetSettings({
    ...petSettings,
    windowX: bounds.x,
    windowY: bounds.y - layout.characterOffset,
  })
  applyPetBubbleBounds()
  if (savePetPositionTimer) clearTimeout(savePetPositionTimer)
  savePetPositionTimer = setTimeout(() => {
    savePetPositionTimer = null
    if (!petWindow || applyingPetBounds) return
    writePetSettings(petSettings)
    broadcastPetSettings()
    scheduleDesktopEnvironmentBroadcast()
  }, 180)
}

function broadcastPetSettings() {
  mainWindow?.webContents.send("mon-agent-pet-settings", petSettings)
  petWindow?.webContents.send("mon-agent-pet-settings", petSettings)
  petBubbleWindow?.webContents.send("mon-agent-pet-settings", petSettings)
  settingsWindow?.webContents.send("mon-agent-pet-settings", petSettings)
}

function parseGSettingsString(value) {
  const trimmed = String(value ?? "").trim()
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\")
  }
  return trimmed
}

function parseGSettingsArray(value) {
  const items = []
  const pattern = /'((?:\\.|[^'])*)'/g
  let match
  while ((match = pattern.exec(String(value ?? "")))) {
    items.push(match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\"))
  }
  return items
}

async function readGSettings(schema, key) {
  const result = await execFileAsync("gsettings", ["get", schema, key], {
    encoding: "utf8",
    timeout: 1500,
  })
  return String(result.stdout ?? "").trim()
}

function wallpaperPathFromUri(uri) {
  if (!uri) return ""
  if (!uri.startsWith("file://")) return uri
  try {
    return fileURLToPath(uri)
  } catch {
    return decodeURIComponent(uri.replace(/^file:\/\//, ""))
  }
}

function panelForDisplay(display, enabled, heights, autoHide, applets) {
  const displayIndex = Math.max(0, screen.getAllDisplays().findIndex((item) => item.id === display.id))
  const panelRecord = enabled
    .map((item) => item.split(":"))
    .find((parts) => Number(parts[1]) === displayIndex)
  if (!panelRecord) return null
  const panelId = Number(panelRecord[0])
  const heightRecord = heights.map((item) => item.split(":")).find((parts) => Number(parts[0]) === panelId)
  const autoHideRecord = autoHide.map((item) => item.split(":")).find((parts) => Number(parts[0]) === panelId)
  return {
    id: panelId,
    position: ["top", "bottom", "left", "right"].includes(panelRecord[2]) ? panelRecord[2] : "bottom",
    height: Math.max(20, Number(heightRecord?.[1]) || 40),
    autoHide: autoHideRecord?.[1] === "true" || autoHideRecord?.[1] === "always",
    applets: applets.filter((item) => item.startsWith(`panel${panelId}:`)),
  }
}

async function readDesktopEnvironment(display) {
  const desktopName = String(process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION || "").toLowerCase()
  const cinnamon = desktopName.includes("cinnamon")
  const wallpaperSchema = cinnamon ? "org.cinnamon.desktop.background" : "org.gnome.desktop.background"
  const [pictureUriValue, pictureOptionsValue, primaryColorValue] = await Promise.all([
    readGSettings(wallpaperSchema, "picture-uri").catch(() => ""),
    readGSettings(wallpaperSchema, "picture-options").catch(() => "'zoom'"),
    readGSettings(wallpaperSchema, "primary-color").catch(() => "'#000000'"),
  ])
  let panel = null
  if (cinnamon) {
    const [enabledValue, heightsValue, autoHideValue, appletsValue] = await Promise.all([
      readGSettings("org.cinnamon", "panels-enabled").catch(() => "[]"),
      readGSettings("org.cinnamon", "panels-height").catch(() => "[]"),
      readGSettings("org.cinnamon", "panels-autohide").catch(() => "[]"),
      readGSettings("org.cinnamon", "enabled-applets").catch(() => "[]"),
    ])
    panel = panelForDisplay(
      display,
      parseGSettingsArray(enabledValue),
      parseGSettingsArray(heightsValue),
      parseGSettingsArray(autoHideValue),
      parseGSettingsArray(appletsValue),
    )
  }
  const pictureUri = parseGSettingsString(pictureUriValue)
  return {
    desktop: cinnamon ? "cinnamon" : desktopName || "linux",
    wallpaper: {
      filePath: wallpaperPathFromUri(pictureUri),
      mode: parseGSettingsString(pictureOptionsValue) || "zoom",
      primaryColor: parseGSettingsString(primaryColorValue) || "#000000",
    },
    panel,
    workArea: { ...display.workArea },
    displayBounds: { ...display.bounds },
  }
}

async function broadcastDesktopEnvironment() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return
  const display = displayForPetSettings(settingsWindow)
  const environment = await readDesktopEnvironment(display)
  if (!settingsWindow || settingsWindow.isDestroyed()) return
  settingsWindow.webContents.send("mon-agent-desktop-environment", environment)
}

function scheduleDesktopEnvironmentBroadcast() {
  if (desktopEnvironmentBroadcastTimer) clearTimeout(desktopEnvironmentBroadcastTimer)
  desktopEnvironmentBroadcastTimer = setTimeout(() => {
    desktopEnvironmentBroadcastTimer = null
    void broadcastDesktopEnvironment()
  }, 160)
}

function startDesktopEnvironmentMonitors() {
  if (process.platform !== "linux") return
  const desktopName = String(process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION || "").toLowerCase()
  const schemas = desktopName.includes("cinnamon")
    ? ["org.cinnamon.desktop.background", "org.cinnamon"]
    : ["org.gnome.desktop.background"]
  for (const schema of schemas) {
    const monitor = spawn("gsettings", ["monitor", schema], { stdio: ["ignore", "pipe", "ignore"] })
    monitor.stdout.on("data", scheduleDesktopEnvironmentBroadcast)
    monitor.on("error", () => undefined)
    desktopEnvironmentMonitors.push(monitor)
  }
}

function stopDesktopEnvironmentMonitors() {
  if (desktopEnvironmentBroadcastTimer) clearTimeout(desktopEnvironmentBroadcastTimer)
  desktopEnvironmentBroadcastTimer = null
  for (const monitor of desktopEnvironmentMonitors.splice(0)) monitor.kill()
}

function updatePetSettings(input) {
  const previousSettings = petSettings
  petSettings = normalizePetSettings({ ...petSettings, ...(input ?? {}) })
  writePetSettings(petSettings)
  applyPetWindowAttributes()
  if (
    previousSettings.petScale !== petSettings.petScale ||
    previousSettings.dock !== petSettings.dock ||
    previousSettings.showInput !== petSettings.showInput ||
    previousSettings.inputHeight !== petSettings.inputHeight ||
    previousSettings.inputWidth !== petSettings.inputWidth ||
    previousSettings.windowX !== petSettings.windowX ||
    previousSettings.windowY !== petSettings.windowY
  ) {
    applyPetWindowBounds()
    scheduleDesktopEnvironmentBroadcast()
  }
  applyPetBubbleVisibility()
  broadcastPetSettings()
  return petSettings
}

function setWindowSize(request = {}, targetWindow = mainWindow) {
  if (!targetWindow) return true
  if (request.mode === "character" || request.pet === true) {
    applyPetWindowBounds()
    return true
  }
  const display = screen.getDisplayMatching(targetWindow.getBounds())
  const workArea = display.workAreaSize
  let width = typeof request.width === "number" ? request.width : undefined
  let height = typeof request.height === "number" ? request.height : undefined

  if (typeof width !== "number" && typeof request.widthRatio === "number") {
    width = workArea.width * request.widthRatio
  }
  if (typeof height !== "number" && typeof request.heightRatio === "number") {
    height = workArea.height * request.heightRatio
  }

  width ??= 960
  height ??= 540
  height = clamp(height, request.minHeight, request.maxHeight)
  if (typeof request.aspectRatio === "number") {
    width = height * request.aspectRatio
  }
  width = clamp(width, request.minWidth, request.maxWidth)

  targetWindow.setMinimumSize(Math.max(1, Math.round(request.minWidth ?? 1)), Math.max(1, Math.round(request.minHeight ?? 1)))
  targetWindow.setMaximumSize(
    Math.max(1, Math.round(request.maxWidth ?? 100000)),
    Math.max(1, Math.round(request.maxHeight ?? 100000)),
  )
  targetWindow.setSize(Math.round(width), Math.round(height), true)
  if (request.center !== false) targetWindow.center()
  return true
}

function setWindowAppearance(mode, targetWindow = mainWindow) {
  if (!targetWindow) return true
  const character = mode === "character"
  if (character) {
    applyPetWindowSettings()
  } else {
    targetWindow.setAlwaysOnTop(false)
    targetWindow.setIgnoreMouseEvents(false)
    targetWindow.setOpacity(1)
    targetWindow.setBackgroundColor("#f5f5f4")
    targetWindow.setHasShadow(true)
  }
  return true
}

function sendViewMode(mode) {
  currentViewMode = mode === "character" ? "character" : "chatWithCharacter"
  mainWindow?.show()
  mainWindow?.webContents.send("mon-agent-view-mode", currentViewMode)
  updateTray()
}

function resolveWebUrl(page) {
  const webPort = Number(getAgentConfig("server", "WEB_PORT", String(DEFAULT_WEB_PORT)))
  const devUrl = `http://127.0.0.1:${Number.isFinite(webPort) ? webPort : DEFAULT_WEB_PORT}`
  if (!page) return devUrl
  const url = new URL(devUrl)
  url.searchParams.set("page", page)
  return url.toString()
}

function navigationPolicyOptions() {
  return {
    isPackaged: app.isPackaged,
    appEntryFile: path.join(frontendRoot, "web", "dist", "index.html"),
    devOrigin: new URL(resolveWebUrl()).origin,
  }
}

function openExternalNavigation(url) {
  if (!isSupportedExternalUrl(url)) {
    console.warn(`[MonAgent][Desktop] 已阻止不受支持的外部导航: ${url}`)
    return
  }
  void shell.openExternal(url).catch((error) => {
    console.warn(`[MonAgent][Desktop] 无法使用系统浏览器打开链接: ${url}`, error)
  })
}

function attachNavigationPolicy(targetWindow) {
  const contents = targetWindow.webContents
  const isInternal = (url) => isInternalAppUrl(url, navigationPolicyOptions())

  contents.setWindowOpenHandler(({ url }) => {
    if (!isInternal(url)) openExternalNavigation(url)
    return { action: "deny" }
  })

  const guardMainFrameNavigation = (event, url) => {
    if (isInternal(url)) return
    event.preventDefault()
    openExternalNavigation(url)
  }
  contents.on("will-navigate", guardMainFrameNavigation)
  contents.on("will-redirect", guardMainFrameNavigation)
}

function loadWebApp(targetWindow, page) {
  attachNavigationPolicy(targetWindow)
  if (app.isPackaged) {
    const options = page ? { query: { page } } : undefined
    targetWindow.loadFile(path.join(frontendRoot, "web", "dist", "index.html"), options)
  } else {
    targetWindow.loadURL(resolveWebUrl(page))
  }
}

function createWindow() {
  const preload = path.join(__dirname, "preload.cjs")

  mainWindow = new BrowserWindow({
    title: APP_WINDOW_TITLE,
    width: 960,
    height: 540,
    minWidth: 1,
    minHeight: 1,
    center: true,
    show: false,
    frame: true,
    titleBarStyle: "default",
    autoHideMenuBar: true,
    transparent: false,
    backgroundColor: "#f5f5f4",
    icon: resolveWindowIcon(),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show()
  })
  mainWindow.on("close", (event) => {
    if (!isQuitting && !hasQuitFlag()) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  attachWindowActivityEvents(mainWindow, "main")
  loadWebApp(mainWindow)
}

async function createPetWindow() {
  petSettings = readPetSettings()

  if (petWindow && !petWindow.isDestroyed()) {
    if (petWindow.isMinimized()) petWindow.restore()
    createPetBubbleWindow()
    applyPetWindowSettings()
    petWindow.showInactive()
    applyPetBubbleVisibility()
    broadcastPetSettings()
    return
  }

  const preload = path.join(__dirname, "preload.cjs")
  const bounds = petWindowLayout().character
  petWindow = new BrowserWindow({
    title: `${APP_WINDOW_TITLE} 桌宠角色`,
    ...(process.platform === "linux" ? { type: "dock" } : {}),
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1,
    minHeight: 1,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    transparent: true,
    backgroundColor: "#00000000",
    icon: resolveWindowIcon(),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  petWindow.once("ready-to-show", () => {
    applyPetWindowSettings()
    petWindow?.showInactive()
    applyPetBubbleVisibility()
    broadcastPetSettings()
  })
  petWindow.on("show", () => {
    updateTray()
    applyPetWindowAttributes()
    applyPetBubbleVisibility()
  })
  petWindow.on("hide", () => {
    petBubbleWindow?.hide()
    updateTray()
  })
  petWindow.on("closed", () => {
    petWindow = null
    if (petBubbleWindow && !petBubbleWindow.isDestroyed()) petBubbleWindow.destroy()
    updateTray()
  })
  petWindow.on("move", savePetWindowPosition)
  attachWindowActivityEvents(petWindow, "pet-character")
  loadWebApp(petWindow, "pet-character")
  createPetBubbleWindow()
  updateTray()
}

function createPetBubbleWindow() {
  if (petBubbleWindow && !petBubbleWindow.isDestroyed()) return

  const preload = path.join(__dirname, "preload.cjs")
  const bounds = petBubbleCollapsed ? petWindowLayout().collapsedBubble : petWindowLayout().expandedBubble
  petBubbleWindow = new BrowserWindow({
    title: `${APP_WINDOW_TITLE} 桌宠气泡`,
    ...(process.platform === "linux" ? { type: "dock" } : {}),
    ...bounds,
    minWidth: 1,
    minHeight: 1,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    skipTaskbar: true,
    focusable: true,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  petBubbleWindow.once("ready-to-show", () => {
    petBubbleWindow?.setSkipTaskbar(true)
    applyPetWindowAttributes()
    applyPetBubbleBounds()
    applyPetBubbleVisibility()
    broadcastPetSettings()
  })
  petBubbleWindow.on("show", () => {
    petBubbleWindow?.setSkipTaskbar(true)
  })
  petBubbleWindow.on("closed", () => {
    petBubbleWindow = null
  })
  attachWindowActivityEvents(petBubbleWindow, "pet-bubble")
  loadWebApp(petBubbleWindow, "pet-bubble")
}

function hidePetWindows() {
  petBubbleWindow?.hide()
  petWindow?.hide()
}

async function createSettingsWindow() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const workArea = display.workArea
  const bounds = {
    x: workArea.x,
    y: workArea.y,
    width: Math.round(workArea.width * SETTINGS_WINDOW_WIDTH_RATIO),
    height: Math.round(workArea.height * SETTINGS_WINDOW_HEIGHT_RATIO),
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore()
    settingsWindow.setBounds(bounds)
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  const preload = path.join(__dirname, "preload.cjs")
  settingsWindow = new BrowserWindow({
    title: "MonAgent 设置",
    ...bounds,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    transparent: false,
    backgroundColor: "#f5f5f4",
    icon: resolveWindowIcon(),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show()
  })
  settingsWindow.on("closed", () => {
    settingsWindow = null
  })
  attachWindowActivityEvents(settingsWindow, "settings")
  loadWebApp(settingsWindow, "settings")
}

function hasQuitFlag() {
  return fs.existsSync(quitFlag)
}

function writeQuitFlag() {
  try {
    fs.mkdirSync(path.dirname(quitFlag), { recursive: true })
    fs.writeFileSync(quitFlag, String(Date.now()), "utf8")
  } catch (error) {
    console.warn("[MonAgent][Desktop] 写入退出标记失败", error)
  }
}

function watchQuitFlag() {
  setInterval(() => {
    if (!hasQuitFlag()) return
    isQuitting = true
    app.quit()
  }, 500).unref?.()
}

function createFallbackTrayIcon() {
  const size = 32
  const canvas = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - 15.5
      const dy = y - 15.5
      const distance = Math.sqrt(dx * dx + dy * dy)
      const inside = distance <= 14
      const ring = distance >= 9.5 && distance <= 12.5
      const offset = (y * size + x) * 4
      const rgba = !inside ? [0, 0, 0, 0] : ring ? [255, 148, 28, 255] : [24, 24, 27, 255]
      canvas[offset] = rgba[2]
      canvas[offset + 1] = rgba[1]
      canvas[offset + 2] = rgba[0]
      canvas[offset + 3] = rgba[3]
    }
  }
  return nativeImage.createFromBitmap(canvas, { width: size, height: size })
}

function updateTray() {
  if (!tray) return
  const petVisible = isPetWindowVisible()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示主窗口", click: () => mainWindow?.show() },
      { label: "隐藏主窗口", click: () => mainWindow?.hide() },
      { type: "separator" },
      {
        label: petVisible ? "隐藏桌宠" : "显示桌宠",
        click: () => {
          if (isPetWindowVisible()) {
            hidePetWindows()
          } else {
            void createPetWindow()
          }
        },
      },
      {
        label: "设置",
        click: () => {
          void createSettingsWindow()
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          isQuitting = true
          writeQuitFlag()
          app.quit()
        },
      },
    ]),
  )
}

function isPetWindowVisible() {
  return Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible())
}

function createTray() {
  tray = new Tray(createDesktopIcon())
  tray.setToolTip(APP_WINDOW_TITLE)
  tray.on("click", () => mainWindow?.show())
  updateTray()
}

function registerFileProtocol() {
  protocol.handle("monagent-file", (request) => {
    const url = new URL(request.url)
    let filePath = decodeURIComponent(url.host ? `/${url.host}${url.pathname}` : url.pathname)
    if (process.platform === "win32" && /^\/[A-Za-z]:/.test(filePath)) {
      filePath = filePath.slice(1)
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function registerPermissions() {
  const isVoiceInputContents = (webContents) => {
    if (!webContents) return false
    const owner = BrowserWindow.fromWebContents(webContents)
    const isMainWindow = Boolean(mainWindow && !mainWindow.isDestroyed() && owner === mainWindow)
    const isPetBubbleWindow = Boolean(petBubbleWindow && !petBubbleWindow.isDestroyed() && owner === petBubbleWindow)
    return isMainWindow || isPetBubbleWindow
  }

  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => {
    if (permission === "geolocation") return true
    if (permission !== "media" || !isVoiceInputContents(webContents)) return false
    return details.mediaType === "audio"
  })

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === "geolocation") {
      callback(true)
      return
    }
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : []
    callback(
      permission === "media" &&
      isVoiceInputContents(webContents) &&
      mediaTypes.includes("audio") &&
      !mediaTypes.includes("video"),
    )
  })
}

async function captureDesktopScreen() {
  if (!app.isReady()) throw new Error("桌面应用尚未就绪，无法截屏")
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const scaleFactor = Number(display.scaleFactor) || 1
  const thumbnailSize = {
    width: Math.max(1, Math.round(display.size.width * scaleFactor)),
    height: Math.max(1, Math.round(display.size.height * scaleFactor)),
  }
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize,
    fetchWindowIcons: false,
  })
  const displayID = String(display.id)
  const source =
    sources.find((item) => String(item.display_id || "") === displayID) ||
    sources.find((item) => String(item.id || "").includes(`:${displayID}:`)) ||
    sources[0]
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error("Electron 未能获取当前显示器截图；请检查系统的屏幕捕获权限")
  }
  const size = source.thumbnail.getSize()
  return {
    dataUrl: source.thumbnail.toDataURL(),
    mime: "image/png",
    width: size.width,
    height: size.height,
    displayId: displayID,
    sourceName: source.name,
  }
}

ipcMain.handle("mon-agent:invoke", async (_event, command, args = {}) => {
  switch (command) {
    case "resolve_core_base_url_command":
      return resolveCoreBaseUrl()
    case "get_dev_account":
      return getDevAccount()
    case "core_login": {
      const response = await coreRequest("/api/users/login/", jsonPost({
        username: args.request?.username,
        password: args.request?.password,
        client_id: args.request?.clientId ?? args.request?.client_id ?? "",
        client_type: args.request?.clientType ?? args.request?.client_type ?? "",
      }))
      setAuthSession(response?.token, {
        valid: true,
        user: response?.user,
        token_info: { expires_at: response?.expires_at },
      })
      startActivityPresence(response?.token, args.request?.clientId ?? args.request?.client_id ?? "")
      return response
    }
    case "core_verify_token": {
      return verifyCoreTokenOnce(args.token, args.clientId ?? args.client_id ?? "")
    }
    case "core_default_assistant":
      return coreRequest("/api/assistants/default/", { method: "GET", headers: authHeader(args.token) })
    case "core_current_assistant":
      return coreRequest("/api/assistants/current/", { method: "GET", headers: authHeader(args.token) })
    case "core_list_assistants":
      return coreRequest("/api/assistants/", { method: "GET", headers: authHeader(args.token) })
    case "core_update_agent_settings":
      return coreRequest("/api/agent/settings/my/", {
        method: "PATCH",
        headers: { ...authHeader(args.token), "content-type": "application/json" },
        body: JSON.stringify(args.input ?? {}),
      })
    case "core_user_profile":
      return coreRequest("/api/users/me/profile/", { method: "GET", headers: authHeader(args.token) })
    case "core_update_user_profile":
      return coreRequest("/api/users/me/profile/", {
        method: "PATCH",
        headers: { ...authHeader(args.token), "content-type": "application/json" },
        body: JSON.stringify(args.input ?? {}),
      })
    case "core_logout": {
      try {
        return await coreRequest("/api/users/logout/", { method: "POST", headers: authHeader(args.token) })
      } finally {
        setAuthSession(null, null)
        stopActivityPresence()
      }
    }
    case "update_activity_facts":
      return updateRendererActivityFacts(_event.sender, args.facts ?? {})
    case "publish_activity_presence":
      return publishActivityPresence()
    case "set_window_size":
      return setWindowSize(args.request ?? {}, BrowserWindow.fromWebContents(_event.sender) ?? mainWindow)
    case "set_window_appearance":
      return setWindowAppearance(args.mode, BrowserWindow.fromWebContents(_event.sender) ?? mainWindow)
    case "open_pet_window":
      await createPetWindow()
      return true
    case "set_view_mode_state":
      currentViewMode = args.mode === "character" ? "character" : "chatWithCharacter"
      updateTray()
      applyPetWindowSettings()
      return true
    case "get_pet_settings":
      return petSettings
    case "apply_pet_settings":
      return updatePetSettings(args.settings ?? {})
    case "set_pet_bubble_collapsed": {
      const targetWindow = BrowserWindow.fromWebContents(_event.sender)
      if (targetWindow === petBubbleWindow) {
        petBubbleCollapsed = Boolean(args.collapsed)
        applyPetBubbleBounds()
        if (petSettings.alwaysOnTop) petBubbleWindow.moveTop()
      }
      return true
    }
    case "get_desktop_environment": {
      const targetWindow = BrowserWindow.fromWebContents(_event.sender) ?? settingsWindow ?? mainWindow
      const display = displayForPetSettings(targetWindow)
      return readDesktopEnvironment(display)
    }
    case "capture_screen":
      return captureDesktopScreen()
    case "select_skill_directory": {
      const targetWindow = BrowserWindow.fromWebContents(_event.sender) ?? mainWindow
      const result = await dialog.showOpenDialog(targetWindow, {
        title: "选择技能目录",
        properties: ["openDirectory"],
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    }
    case "start_window_drag":
      return true
    case "close_current_window": {
      const targetWindow = BrowserWindow.fromWebContents(_event.sender)
      targetWindow?.close()
      return true
    }
    case "minimize_current_window": {
      const targetWindow = BrowserWindow.fromWebContents(_event.sender)
      targetWindow?.minimize()
      return true
    }
    case "toggle_maximize_current_window": {
      const targetWindow = BrowserWindow.fromWebContents(_event.sender)
      if (!targetWindow) return false
      if (targetWindow.isMaximized()) {
        targetWindow.unmaximize()
      } else {
        targetWindow.maximize()
      }
      return true
    }
    default:
      throw new Error(`未知桌面命令: ${command}`)
  }
})

const allowMultipleInstances = process.env.MON_AGENT_ALLOW_MULTIPLE_INSTANCES === "true"

if (!allowMultipleInstances && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
app.on("second-instance", () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    startDevParentWatch()
    startActivityPresenceSystemEvents()
    Menu.setApplicationMenu(null)
    watchQuitFlag()
    registerFileProtocol()
    registerPermissions()
    startDesktopEnvironmentMonitors()
    createWindow()
    if (process.env.MON_AGENT_DESKTOP_START_PAGE === "settings") {
      void createSettingsWindow()
    } else if (process.env.MON_AGENT_DESKTOP_START_PAGE === "pet") {
      void createPetWindow()
    }
    createTray()
  })

  app.on("before-quit", () => {
    isQuitting = true
    stopActivityPresence()
    if (devParentWatchTimer) {
      clearInterval(devParentWatchTimer)
      devParentWatchTimer = null
    }
    stopDesktopEnvironmentMonitors()
  })

  app.on("window-all-closed", (event) => {
    event.preventDefault()
  })
}
