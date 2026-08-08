const { app, BrowserWindow, Menu, Tray, desktopCapturer, dialog, ipcMain, nativeImage, powerMonitor, protocol, screen, net, session, shell } = require("electron")
const { execFile } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const { promisify } = require("node:util")
const { createDesktopEnvironmentService } = require("./app/desktop-environment.cjs")
const { createWorkspaceContext } = require("./app/workspace-context.cjs")
const { createActivityPresenceService } = require("./activity/activity-presence.cjs")
const { registerDesktopIpc } = require("./ipc/command-router.cjs")
const { createCoreCommandHandlers } = require("./ipc/core-command-handlers.cjs")
const { createWindowCommandHandlers } = require("./ipc/window-command-handlers.cjs")
const { createPetGroupDrag, petGroupPositionAtPointer } = require("./pet/pet-group-drag.cjs")
const { calculatePetWindowBounds, calculatePetWindowLayout, petCoordinate } = require("./pet/pet-layout.cjs")
const { DEFAULT_PET_SETTINGS, normalizePetSettings } = require("./pet/pet-settings.cjs")
const { createPetSettingsStore } = require("./pet/pet-settings-store.cjs")
const { isInternalAppUrl, isSupportedExternalUrl } = require("./protocols/navigation-policy.cjs")
const { resolvePetBubbleSurfaceVisibility, setWindowVisibleWithoutActivation } = require("./pet/pet-bubble-surfaces.cjs")
const { SpeechPlaybackCoordinator } = require("./speech/speech-playback-coordinator.cjs")
const { applyBubbleKeyboardFocus, makeWindowNonActivating } = require("./pet/pet-window-focus.cjs")
const { createWindowsNoActivateController } = require("./windows/windows-noactivate.cjs")
const { createDesktopCapture } = require("./media/desktop-capture.cjs")
const { registerMediaPermissions } = require("./permissions/register-media-permissions.cjs")
const { createProcessLifecycle } = require("./processes/process-lifecycle.cjs")
const { registerFileProtocol } = require("./protocols/register-file-protocol.cjs")
const { createWebAppLoader } = require("./windows/web-app-loader.cjs")
const { createTrayController } = require("./windows/tray-controller.cjs")

const execFileAsync = promisify(execFile)
const { captureDesktopScreen } = createDesktopCapture({ app, desktopCapturer, screen })

const APP_WINDOW_TITLE = "MonAgent — AI 个人助手"
const DEFAULT_CORE_HOST = "127.0.0.1"
const DEFAULT_CORE_PORT = 40011
const DEFAULT_WEB_PORT = 40091
const SETTINGS_WINDOW_WIDTH_RATIO = 1
const SETTINGS_WINDOW_HEIGHT_RATIO = 1

const workspaceContext = createWorkspaceContext({
  app,
  moduleDir: __dirname,
  defaultCoreHost: DEFAULT_CORE_HOST,
  defaultCorePort: DEFAULT_CORE_PORT,
})
const {
  agentRoot,
  frontendRoot,
  getAgentConfig,
  getDevAccount,
  readText,
  resolveCoreBaseUrl,
  resolveDesktopIconPath,
  resolveMonConfigPath,
  resolveWindowIcon,
} = workspaceContext
const quitFlag =
  process.env.MON_AGENT_DESKTOP_QUIT_FLAG?.trim() ||
  resolveMonConfigPath("desktop", "QUIT_FLAG", ".artifacts/desktop-quit.flag")
const petSettingsPath = resolveMonConfigPath("desktop", "PET_SETTINGS", ".artifacts/desktop-pet-settings.json")
const performanceLogPath = path.join(agentRoot, ".artifacts", "frontend-performance.jsonl")
const petSettingsStore = createPetSettingsStore({
  filePath: petSettingsPath,
  defaults: DEFAULT_PET_SETTINGS,
  normalize: normalizePetSettings,
})
const { loadWebApp } = createWebAppLoader({
  app,
  shell,
  frontendRoot,
  getWebPort: () => getAgentConfig("server", "WEB_PORT", String(DEFAULT_WEB_PORT)),
  defaultWebPort: DEFAULT_WEB_PORT,
  isInternalAppUrl,
  isSupportedExternalUrl,
})
const desktopEnvironmentService = createDesktopEnvironmentService({
  screen,
  execFileAsync,
  onChanged: scheduleDesktopEnvironmentBroadcast,
})
let mainWindow = null
let petWindow = null
let petBubbleWindow = null
let petBubbleIconWindow = null
let settingsWindow = null
let questionWindow = null
let isQuitting = false
let currentViewMode = "chatWithCharacter"
let petSettings = petSettingsStore.read()
let applyingPetBounds = false
let savePetPositionTimer = null
let petBubbleCollapsed = false
let petBubbleKeyboardFocus = false
let petGroupDrag = null
let desktopEnvironmentBroadcastTimer = null
let authSession = null
let authVerification = null
const AUTH_VERIFICATION_TTL_MS = 30_000
const {
  attachWindowActivityEvents,
  publishActivityPresence,
  startActivityPresence,
  startActivityPresenceSystemEvents,
  stopActivityPresence,
  updateRendererActivityFacts,
} = createActivityPresenceService({
  execFileAsync,
  readText,
  powerMonitor,
  getWindows: () => ({ mainWindow, petWindow, petBubbleWindow, petBubbleIconWindow, settingsWindow }),
  getCurrentViewMode: () => currentViewMode,
  coreRequest,
  authHeader,
  isQuitting: () => isQuitting,
})
const { createTray, updateTray } = createTrayController({
  Menu,
  Tray,
  nativeImage,
  title: APP_WINDOW_TITLE,
  resolveDesktopIconPath,
  getMainWindow: () => mainWindow,
  getPetWindow: () => petWindow,
  hidePetWindows,
  createPetWindow,
  createSettingsWindow,
  onQuit: () => {
    isQuitting = true
    writeQuitFlag()
    app.quit()
  },
})

function sendSpeechPlaybackControl(ownerId, control) {
  const ownerWindow = BrowserWindow.getAllWindows().find(
    (candidate) => !candidate.isDestroyed() && candidate.webContents.id === ownerId,
  )
  if (ownerWindow && !ownerWindow.webContents.isDestroyed()) {
    ownerWindow.webContents.send("mon-agent-speech-playback-control", control)
  }
}

const speechPlaybackCoordinator = new SpeechPlaybackCoordinator(sendSpeechPlaybackControl)
const windowsNoActivate = createWindowsNoActivateController()

function applyPetNativeTopmost(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return false
  if (targetWindow.isAlwaysOnTop() !== petSettings.alwaysOnTop) {
    targetWindow.setAlwaysOnTop(petSettings.alwaysOnTop)
  }
  return windowsNoActivate.applyTopmost(targetWindow, petSettings.alwaysOnTop)
}

function applyPetBubbleKeyboardFocus(targetWindow, enabled, collapsed) {
  const active = Boolean(enabled && !collapsed)
  if (active) windowsNoActivate.apply(targetWindow, false)
  const result = applyBubbleKeyboardFocus(
    targetWindow,
    enabled,
    collapsed,
    petSettings.alwaysOnTop,
  )
  if (!active) windowsNoActivate.apply(targetWindow, true)
  applyPetNativeTopmost(targetWindow)
  if (targetWindow !== petWindow) applyPetNativeTopmost(petWindow)
  return result
}

function speechSurfaceForSender(sender) {
  const ownerWindow = BrowserWindow.fromWebContents(sender)
  if (ownerWindow === mainWindow) return "main-chat"
  if (ownerWindow === petBubbleWindow) return "pet-bubble"
  return null
}

function preferredAutomaticSpeechSurface() {
  const bubbleVisible = Boolean(
    petBubbleWindow && !petBubbleWindow.isDestroyed() && petBubbleWindow.isVisible(),
  )
  return bubbleVisible ? "pet-bubble" : "main-chat"
}

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

const processLifecycle = createProcessLifecycle({
  app,
  getIsQuitting: () => isQuitting,
  markQuitting: () => { isQuitting = true },
})
processLifecycle.registerOutputErrorHandlers()

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

function clamp(value, min, max) {
  const withMin = typeof min === "number" ? Math.max(value, min) : value
  return typeof max === "number" ? Math.min(withMin, max) : withMin
}

function displayForPetSettings(fallbackWindow) {
  const storedX = petCoordinate(petSettings.windowX)
  const storedY = petCoordinate(petSettings.windowY)
  if (storedX !== null && storedY !== null) return screen.getDisplayNearestPoint({ x: storedX, y: storedY })
  if (petWindow && !petWindow.isDestroyed()) return screen.getDisplayMatching(petWindow.getBounds())
  if (fallbackWindow && !fallbackWindow.isDestroyed()) return screen.getDisplayMatching(fallbackWindow.getBounds())
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

function petWindowBounds() {
  const display = displayForPetSettings()
  return calculatePetWindowBounds(petSettings, display.workArea)
}

function petWindowLayout() {
  const display = displayForPetSettings()
  return calculatePetWindowLayout(petSettings, display.workArea)
}

function applyPetWindowAttributes() {
  if (petWindow && !petWindow.isDestroyed()) {
    makeWindowNonActivating(petWindow)
    windowsNoActivate.apply(petWindow, true)
    applyPetNativeTopmost(petWindow)
    petWindow.setIgnoreMouseEvents(petSettings.clickThrough)
    petWindow.setOpacity(1)
    petWindow.setBackgroundColor(petSettings.transparentWindow ? "#00000000" : "#f5f5f4")
    petWindow.setHasShadow(!petSettings.transparentWindow)
  }
  if (petBubbleWindow && !petBubbleWindow.isDestroyed()) {
    petBubbleWindow.setSkipTaskbar(true)
    petBubbleWindow.setIgnoreMouseEvents(false)
    petBubbleWindow.setOpacity(1)
    petBubbleWindow.setBackgroundColor("#00000000")
    petBubbleWindow.setHasShadow(false)
    applyPetBubbleKeyboardFocus(
      petBubbleWindow,
      petBubbleKeyboardFocus,
      petBubbleCollapsed,
    )
  }
  if (petBubbleIconWindow && !petBubbleIconWindow.isDestroyed()) {
    petBubbleIconWindow.setSkipTaskbar(true)
    petBubbleIconWindow.setIgnoreMouseEvents(false)
    petBubbleIconWindow.setOpacity(1)
    petBubbleIconWindow.setBackgroundColor("#00000000")
    petBubbleIconWindow.setHasShadow(false)
    applyPetBubbleKeyboardFocus(petBubbleIconWindow, false, true)
  }
  // Windows keeps an owned window above its owner. Reassert the character
  // owner last so making the panel/icon topmost cannot demote it below a game.
  applyPetNativeTopmost(petWindow)
}

function applyPetBubbleBounds() {
  const layout = petWindowLayout()
  if (petBubbleWindow && !petBubbleWindow.isDestroyed()) {
    petBubbleWindow.setBounds(layout.expandedBubble, false)
  }
  if (petBubbleIconWindow && !petBubbleIconWindow.isDestroyed()) {
    petBubbleIconWindow.setBounds(layout.collapsedBubble, false)
  }
}

function applyPetBubbleVisibility() {
  const characterVisible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible())
  const { panelVisible, iconVisible } = resolvePetBubbleSurfaceVisibility({
    characterVisible,
    showInput: petSettings.showInput,
    collapsed: petBubbleCollapsed,
  })

  if (!panelVisible) {
    petBubbleKeyboardFocus = false
    if (petBubbleWindow && !petBubbleWindow.isDestroyed()) {
      applyPetBubbleKeyboardFocus(petBubbleWindow, false, true)
    }
  }
  setWindowVisibleWithoutActivation(petBubbleWindow, panelVisible)
  setWindowVisibleWithoutActivation(petBubbleIconWindow, iconVisible)
  applyPetNativeTopmost(petBubbleWindow)
  applyPetNativeTopmost(petBubbleIconWindow)
  applyPetNativeTopmost(petWindow)
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
  if (!petWindow || applyingPetBounds || petGroupDrag) return
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
    petSettingsStore.write(petSettings)
    broadcastPetSettings()
    scheduleDesktopEnvironmentBroadcast()
  }, 180)
}

function broadcastPetSettings() {
  mainWindow?.webContents.send("mon-agent-pet-settings", petSettings)
  petWindow?.webContents.send("mon-agent-pet-settings", petSettings)
  petBubbleWindow?.webContents.send("mon-agent-pet-settings", petSettings)
  petBubbleIconWindow?.webContents.send("mon-agent-pet-settings", petSettings)
  settingsWindow?.webContents.send("mon-agent-pet-settings", petSettings)
}

function updatePetGroupDrag(sender, args = {}) {
  if (!petGroupDrag || petGroupDrag.ownerId !== sender.id) return false
  const position = petGroupPositionAtPointer(petGroupDrag, args.screenX, args.screenY)
  if (!position) return false
  petSettings = normalizePetSettings({ ...petSettings, windowX: position.x, windowY: position.y })
  applyPetWindowBounds()
  return true
}

function finishPetGroupDrag(sender, args = {}) {
  if (!petGroupDrag || petGroupDrag.ownerId !== sender.id) return false
  updatePetGroupDrag(sender, args)
  petGroupDrag = null
  petSettingsStore.write(petSettings)
  broadcastPetSettings()
  scheduleDesktopEnvironmentBroadcast()
  return true
}

function broadcastPetBubbleCollapsed() {
  for (const targetWindow of [mainWindow, petWindow, petBubbleWindow, petBubbleIconWindow, settingsWindow]) {
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send("mon-agent-pet-bubble-collapsed", petBubbleCollapsed)
    }
  }
}

async function broadcastDesktopEnvironment() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return
  const display = displayForPetSettings(settingsWindow)
  const environment = await desktopEnvironmentService.read(display)
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

function stopDesktopEnvironmentMonitors() {
  if (desktopEnvironmentBroadcastTimer) clearTimeout(desktopEnvironmentBroadcastTimer)
  desktopEnvironmentBroadcastTimer = null
  desktopEnvironmentService.stopMonitors()
}

function updatePetSettings(input) {
  const previousSettings = petSettings
  petSettings = normalizePetSettings({ ...petSettings, ...(input ?? {}) })
  petSettingsStore.write(petSettings)
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

function attachRendererDiagnostics(targetWindow, label) {
  if (app.isPackaged) return
  const contents = targetWindow.webContents
  const report = (message) => {
    const line = `[${new Date().toISOString()}] [${label}] ${message}`
    console.error(`[MonAgent][Renderer] ${line}`)
    try {
      const diagnosticsDir = path.join(agentRoot, ".artifacts")
      fs.mkdirSync(diagnosticsDir, { recursive: true })
      fs.appendFileSync(path.join(diagnosticsDir, "renderer-diagnostics.log"), `${line}\n`, "utf8")
    } catch (error) {
      console.error(`[MonAgent][Renderer] unable to write diagnostics: ${error.message || error}`)
    }
  }
  contents.on("console-message", (_event, ...args) => {
    const details = args[0] && typeof args[0] === "object"
      ? args[0]
      : { level: args[0], message: args[1], lineNumber: args[2], sourceId: args[3] }
    const level = details.level
    if (level !== "error" && level !== 3) return
    const source = details.sourceId ? ` (${details.sourceId}:${details.lineNumber ?? 0})` : ""
    report(`${details.message ?? "Unknown renderer error"}${source}`)
  })
  contents.on("render-process-gone", (_event, details) => {
    report(`process gone: ${details.reason} (${details.exitCode})`)
  })
  contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return
    report(`load failed: ${code} ${description} ${url}`)
  })
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
  attachRendererDiagnostics(mainWindow, "main")
  attachWindowActivityEvents(mainWindow, "main")
  if (!app.isPackaged && process.env.MON_AGENT_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.openDevTools({ mode: "detach", activate: true })
    })
  }
  loadWebApp(mainWindow)
}

function createQuestionWindow() {
  if (questionWindow && !questionWindow.isDestroyed()) return questionWindow
  const preload = path.join(__dirname, "preload.cjs")
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const workArea = display.workArea
  const bounds = {
    width: Math.round(workArea.width * 0.36),
    height: Math.round(workArea.height * 0.72),
  }
  questionWindow = new BrowserWindow({
    title: "MonAgent 用户决策",
    ...bounds,
    minWidth: Math.round(workArea.width * 0.28),
    minHeight: Math.round(workArea.height * 0.5),
    center: true,
    show: false,
    frame: true,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    skipTaskbar: false,
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
  questionWindow.on("close", (event) => {
    if (isQuitting || hasQuitFlag()) return
    event.preventDefault()
    questionWindow?.hide()
  })
  questionWindow.on("closed", () => {
    questionWindow = null
  })
  attachRendererDiagnostics(questionWindow, "question")
  attachWindowActivityEvents(questionWindow, "question")
  loadWebApp(questionWindow, "question")
  return questionWindow
}

function setQuestionWindowVisible(visible) {
  const targetWindow = createQuestionWindow()
  if (!visible) {
    targetWindow.hide()
    return true
  }
  if (targetWindow.isMinimized()) targetWindow.restore()
  targetWindow.setAlwaysOnTop(true)
  targetWindow.show()
  targetWindow.focus()
  return true
}

async function createPetWindow() {
  petSettings = petSettingsStore.read()

  if (petWindow && !petWindow.isDestroyed()) {
    if (petWindow.isMinimized()) petWindow.restore()
    createPetBubbleWindows()
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
    focusable: false,
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
    petBubbleKeyboardFocus = false
    setWindowVisibleWithoutActivation(petBubbleWindow, false)
    setWindowVisibleWithoutActivation(petBubbleIconWindow, false)
    updateTray()
  })
  petWindow.on("closed", () => {
    petGroupDrag = null
    petWindow = null
    if (petBubbleWindow && !petBubbleWindow.isDestroyed()) petBubbleWindow.destroy()
    if (petBubbleIconWindow && !petBubbleIconWindow.isDestroyed()) petBubbleIconWindow.destroy()
    updateTray()
  })
  petWindow.on("move", savePetWindowPosition)
  attachWindowActivityEvents(petWindow, "pet-character")
  loadWebApp(petWindow, "pet-character")
  createPetBubbleWindows()
  updateTray()
}

function createPetBubbleWindows() {
  createPetBubblePanelWindow()
  createPetBubbleIconWindow()
}

function createPetBubblePanelWindow() {
  if (petBubbleWindow && !petBubbleWindow.isDestroyed()) return

  const preload = path.join(__dirname, "preload.cjs")
  const bounds = petWindowLayout().expandedBubble
  petBubbleWindow = new BrowserWindow({
    title: `${APP_WINDOW_TITLE} 桌宠气泡`,
    parent: petWindow ?? undefined,
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
    focusable: false,
    alwaysOnTop: petSettings.alwaysOnTop,
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
    applyPetNativeTopmost(petBubbleWindow)
    applyPetNativeTopmost(petWindow)
  })
  petBubbleWindow.on("blur", () => {
    if (!petBubbleKeyboardFocus) return
    petBubbleKeyboardFocus = false
    applyPetBubbleKeyboardFocus(petBubbleWindow, false, petBubbleCollapsed)
  })
  const petBubbleContentsId = petBubbleWindow.webContents.id
  petBubbleWindow.on("hide", () => {
    petBubbleKeyboardFocus = false
    speechPlaybackCoordinator.revokeOwner(petBubbleContentsId, "window-hidden")
  })
  petBubbleWindow.on("closed", () => {
    speechPlaybackCoordinator.revokeOwner(petBubbleContentsId, "window-closed")
    petGroupDrag = null
    petBubbleWindow = null
  })
  attachWindowActivityEvents(petBubbleWindow, "pet-bubble")
  loadWebApp(petBubbleWindow, "pet-bubble")
}

function createPetBubbleIconWindow() {
  if (petBubbleIconWindow && !petBubbleIconWindow.isDestroyed()) return

  const preload = path.join(__dirname, "preload.cjs")
  const bounds = petWindowLayout().collapsedBubble
  petBubbleIconWindow = new BrowserWindow({
    title: `${APP_WINDOW_TITLE} 桌宠气泡图标`,
    parent: petWindow ?? undefined,
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
    focusable: false,
    alwaysOnTop: petSettings.alwaysOnTop,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  petBubbleIconWindow.once("ready-to-show", () => {
    petBubbleIconWindow?.setSkipTaskbar(true)
    applyPetWindowAttributes()
    applyPetBubbleBounds()
    applyPetBubbleVisibility()
    broadcastPetSettings()
  })
  petBubbleIconWindow.on("show", () => {
    petBubbleIconWindow?.setSkipTaskbar(true)
    applyPetNativeTopmost(petBubbleIconWindow)
    applyPetNativeTopmost(petWindow)
  })
  petBubbleIconWindow.on("closed", () => {
    petGroupDrag = null
    petBubbleIconWindow = null
  })
  attachWindowActivityEvents(petBubbleIconWindow, "pet-icon")
  loadWebApp(petBubbleIconWindow, "pet-icon")
}

function hidePetWindows() {
  setWindowVisibleWithoutActivation(petBubbleWindow, false)
  setWindowVisibleWithoutActivation(petBubbleIconWindow, false)
  if (petWindow && !petWindow.isDestroyed()) petWindow.hide()
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

registerDesktopIpc({
  ipcMain,
  handlers: {
    ...createCoreCommandHandlers({
      resolveCoreBaseUrl,
      getDevAccount,
      coreRequest,
      setAuthSession,
      startActivityPresence,
      verifyCoreTokenOnce,
      authHeader,
      stopActivityPresence,
    }),
    ...createWindowCommandHandlers({ BrowserWindow, dialog, getMainWindow: () => mainWindow }),
    update_activity_facts: ({ sender, args }) => updateRendererActivityFacts(sender, args.facts ?? {}),
    report_performance_diagnostic: ({ sender, args }) => {
      const entry = {
        time: new Date().toISOString(),
        rendererId: sender.id,
        kind: String(args.kind || "unknown").slice(0, 80),
        metrics: args.metrics && typeof args.metrics === "object" ? args.metrics : {},
      }
      fs.mkdirSync(path.dirname(performanceLogPath), { recursive: true })
      fs.appendFile(performanceLogPath, `${JSON.stringify(entry)}\n`, "utf8", (error) => {
        if (error) console.warn("[MonAgent][Performance] 写入诊断日志失败", error)
      })
      return true
    },
    claim_speech_playback: ({ sender, args }) => {
      const surface = speechSurfaceForSender(sender)
      if (!surface) return { granted: false, reason: "unsupported-surface" }
      return speechPlaybackCoordinator.claim({
        ownerId: sender.id,
        surface,
        segmentId: String(args.segmentId || ""),
        intent: args.intent === "manual" ? "manual" : "auto",
        preferredAutoSurface: preferredAutomaticSpeechSurface(),
      })
    },
    release_speech_playback: ({ sender, args }) => {
      return speechPlaybackCoordinator.release(sender.id, String(args.leaseId || ""))
    },
    publish_activity_presence: () => publishActivityPresence(),
    set_window_size: ({ sender, args }) => {
      return setWindowSize(args.request ?? {}, BrowserWindow.fromWebContents(sender) ?? mainWindow)
    },
    set_window_appearance: ({ sender, args }) => {
      return setWindowAppearance(args.mode, BrowserWindow.fromWebContents(sender) ?? mainWindow)
    },
    open_pet_window: async () => {
      await createPetWindow()
      return true
    },
    set_question_window_visible: ({ args }) => setQuestionWindowVisible(Boolean(args.visible)),
    set_view_mode_state: ({ args }) => {
      currentViewMode = args.mode === "character" ? "character" : "chatWithCharacter"
      updateTray()
      applyPetWindowSettings()
      return true
    },
    get_pet_settings: () => petSettings,
    get_pet_bubble_collapsed: () => petBubbleCollapsed,
    apply_pet_settings: ({ args }) => updatePetSettings(args.settings ?? {}),
    set_pet_bubble_collapsed: ({ sender, args }) => {
      const targetWindow = BrowserWindow.fromWebContents(sender)
      if (targetWindow === petBubbleWindow || targetWindow === petBubbleIconWindow) {
        petBubbleCollapsed = Boolean(args.collapsed)
        petBubbleKeyboardFocus = false
        if (petBubbleWindow && !petBubbleWindow.isDestroyed()) {
          applyPetBubbleKeyboardFocus(petBubbleWindow, false, true)
        }
        if (!petBubbleCollapsed) petGroupDrag = null
        broadcastPetBubbleCollapsed()
        applyPetBubbleVisibility()
      }
      return true
    },
    set_pet_bubble_keyboard_focus: ({ sender, args }) => {
      const targetWindow = BrowserWindow.fromWebContents(sender)
      if (targetWindow !== petBubbleWindow) return false
      petBubbleKeyboardFocus = Boolean(args.enabled) && !petBubbleCollapsed && petBubbleWindow.isVisible()
      return applyPetBubbleKeyboardFocus(petBubbleWindow, petBubbleKeyboardFocus, petBubbleCollapsed)
    },
    begin_pet_group_drag: ({ sender, args }) => {
      const targetWindow = BrowserWindow.fromWebContents(sender)
      if (targetWindow !== petBubbleIconWindow || !petBubbleCollapsed) return false
      const group = petWindowBounds()
      petGroupDrag = createPetGroupDrag({
        ownerId: sender.id,
        pointerX: args.screenX,
        pointerY: args.screenY,
        groupX: group.x,
        groupY: group.y,
      })
      return Boolean(petGroupDrag)
    },
    update_pet_group_drag: ({ sender, args }) => updatePetGroupDrag(sender, args),
    end_pet_group_drag: ({ sender, args }) => finishPetGroupDrag(sender, args),
    get_desktop_environment: ({ sender }) => {
      const targetWindow = BrowserWindow.fromWebContents(sender) ?? settingsWindow ?? mainWindow
      return desktopEnvironmentService.read(displayForPetSettings(targetWindow))
    },
    capture_screen: ({ args }) => captureDesktopScreen(args.source),
  },
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
    processLifecycle.startDevParentWatch()
    startActivityPresenceSystemEvents()
    Menu.setApplicationMenu(null)
    watchQuitFlag()
    registerFileProtocol({ protocol, net })
    registerMediaPermissions({
      defaultSession: session.defaultSession,
      BrowserWindow,
      getMainWindow: () => mainWindow,
      getPetBubbleWindow: () => petBubbleWindow,
    })
    desktopEnvironmentService.startMonitors()
    createWindow()
    createQuestionWindow()
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
    processLifecycle.stopDevParentWatch()

    stopDesktopEnvironmentMonitors()
  })

  app.on("window-all-closed", (event) => {
    event.preventDefault()
  })
}
