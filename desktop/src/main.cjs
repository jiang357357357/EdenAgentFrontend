const { app, BrowserWindow, Menu, Tray, desktopCapturer, dialog, ipcMain, nativeImage, powerMonitor, protocol, screen, net, session, shell } = require("electron")
const { execFile, spawn } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const { promisify } = require("node:util")
const { createDesktopEnvironmentService } = require("./app/desktop-environment.cjs")
const { createLocalRuntimeConfigStore } = require("./app/local-runtime-config.cjs")
const { createLocalRuntimeService } = require("./app/local-runtime-service.cjs")
const { createWorkspaceContext } = require("./app/workspace-context.cjs")
const { createActivityPresenceService } = require("./activity/activity-presence.cjs")
const { registerDesktopIpc } = require("./ipc/command-router.cjs")
const { createCoreCommandHandlers } = require("./ipc/core-command-handlers.cjs")
const { parseCoreError } = require("./ipc/core-response-error.cjs")
const { createWindowCommandHandlers } = require("./ipc/window-command-handlers.cjs")
const { createPetGroupDrag, petGroupPositionAtPointer } = require("./pet/pet-group-drag.cjs")
const { createGlobalPointerObserver } = require("./pet/global-pointer-observer.cjs")
const { calculatePetWindowBounds, calculatePetWindowLayout, petCoordinate } = require("./pet/pet-layout.cjs")
const { createPetMousePassthroughController } = require("./pet/pet-mouse-passthrough.cjs")
const {
  calculatePetWindowHostLayout,
  sameBounds,
  sameCharacterViewport,
  usesPetWorkAreaHost,
} = require("./pet/pet-window-host.cjs")
const { DEFAULT_PET_SETTINGS, normalizePetSettings } = require("./pet/pet-settings.cjs")
const { createPetSettingsStore } = require("./pet/pet-settings-store.cjs")
const { isInternalAppUrl, isSupportedExternalUrl } = require("./protocols/navigation-policy.cjs")
const { resolvePetBubbleSurfaceVisibility, setWindowVisibleWithoutActivation } = require("./pet/pet-bubble-surfaces.cjs")
const { SpeechPlaybackCoordinator } = require("./speech/speech-playback-coordinator.cjs")
const { createSpeechDiagnostics } = require("./speech/speech-diagnostics.cjs")
const {
  applyBubbleKeyboardFocus,
  makeWindowNonActivating,
  reassertWindowTopmost,
} = require("./pet/pet-window-focus.cjs")
const { createDesktopCapture } = require("./media/desktop-capture.cjs")
const { registerMediaPermissions } = require("./permissions/register-media-permissions.cjs")
const { createProcessLifecycle } = require("./processes/process-lifecycle.cjs")
const { createRustServerManager } = require("./processes/rust-server.cjs")
const { createDesktopQuitFlagController } = require("./processes/desktop-quit-flag.cjs")
const { registerFileProtocol } = require("./protocols/register-file-protocol.cjs")
const { createWebAppLoader } = require("./windows/web-app-loader.cjs")
const { createTrayController } = require("./windows/tray-controller.cjs")
const { rendererConsoleError } = require("./windows/renderer-console-message.cjs")

const execFileAsync = promisify(execFile)
const { captureDesktopScreen } = createDesktopCapture({ app, desktopCapturer, screen })

const APP_WINDOW_TITLE = "Eden Agent — AI 个人助手"
const DEFAULT_CORE_HOST = "127.0.0.1"
const DEFAULT_CORE_PORT = 40011
const DEFAULT_WEB_PORT = 40091
const SETTINGS_WINDOW_WIDTH_RATIO = 1
const SETTINGS_WINDOW_HEIGHT_RATIO = 1
const PET_CHARACTER_TOPMOST_LEVEL = "screen-saver"
const PET_INTERACTION_TOPMOST_LEVEL = "floating"

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
const quitFlagPath =
  process.env.EDEN_AGENT_DESKTOP_QUIT_FLAG?.trim() ||
  resolveMonConfigPath("desktop", "QUIT_FLAG", ".artifacts/desktop-quit.flag")
const quitFlagController = createDesktopQuitFlagController({ quitFlagPath })
const localRuntimeConfig = createLocalRuntimeConfigStore({ app, agentRoot })
const rustServer = createRustServerManager({
  app,
  agentRoot,
  getRuntimeEnvironment: () => localRuntimeConfig.environment(),
})
const localRuntimeService = createLocalRuntimeService({
  configStore: localRuntimeConfig,
  rustServer,
  serverHealthUrl: `http://127.0.0.1:${process.env.EDEN_AGENT_LOCAL_PORT || "40093"}/healthz`,
})
ipcMain.handle("eden-agent:capability", (_event, origin) => rustServer.capability(origin))
quitFlagController.clearStaleFlagForLaunch()
const petSettingsPath = resolveMonConfigPath("desktop", "PET_SETTINGS", ".artifacts/desktop-pet-settings.json")
const performanceLogPath = path.join(agentRoot, ".artifacts", "frontend-performance.jsonl")
const speechLogPath = path.join(agentRoot, ".artifacts", "speech-playback.jsonl")
const speechDiagnostics = createSpeechDiagnostics(speechLogPath)
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
let petBoundsSettleTimer = null
let savePetPositionTimer = null
let petBubbleCollapsed = false
let petBubbleKeyboardFocus = false
let petBubbleBlurTimer = null
let petGroupDrag = null
let petIconPlacement = { anchor: "top-left", edge: "none" }
let petCharacterViewport = { mode: "window", x: 0, y: 0, width: 1, height: 1 }
let desktopEnvironmentBroadcastTimer = null
let authSession = null
let authVerification = null
const AUTH_VERIFICATION_TTL_MS = 30_000
const pointerObserverExecutablePath =
  process.env.EDEN_AGENT_POINTER_OBSERVER?.trim() ||
  (app.isPackaged
    ? path.join(process.resourcesPath, "edenagent-pointer-observer.exe")
    : path.resolve(__dirname, "..", "native", "win32-pointer-observer", "bin", "edenagent-pointer-observer.exe"))
const globalPointerObserver = createGlobalPointerObserver({
  platform: process.platform,
  executablePath: pointerObserverExecutablePath,
  spawnProcess: spawn,
  getCursorPoint: () => screen.getCursorScreenPoint(),
  getTargetWindow: () => petWindow,
  logger: console,
})
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
    quitFlagController.signalQuit()
    app.quit()
  },
})

function sendSpeechPlaybackControl(ownerId, control) {
  const ownerWindow = BrowserWindow.getAllWindows().find(
    (candidate) => !candidate.isDestroyed() && candidate.webContents.id === ownerId,
  )
  if (ownerWindow && !ownerWindow.webContents.isDestroyed()) {
    ownerWindow.webContents.send("eden-agent-speech-playback-control", control)
  }
}

const speechPlaybackCoordinator = new SpeechPlaybackCoordinator(sendSpeechPlaybackControl, {
  onEvent: (event, details) => speechDiagnostics.append("coordinator", event, details),
})
const petMousePassthrough = createPetMousePassthroughController({
  getWindow: () => petWindow,
  getClickThrough: () => petSettings.clickThrough,
})

function applyPetTopmost(targetWindow) {
  const level = targetWindow === petWindow
    ? PET_CHARACTER_TOPMOST_LEVEL
    : PET_INTERACTION_TOPMOST_LEVEL
  return reassertWindowTopmost(targetWindow, petSettings.alwaysOnTop, level)
}

function syncGlobalPointerObserver() {
  const enabled = Boolean(
    petSettings.clickThrough &&
    petWindow &&
    !petWindow.isDestroyed() &&
    petWindow.isVisible(),
  )
  globalPointerObserver.setEnabled(enabled)
}

function applyPetBubbleKeyboardFocus(targetWindow, enabled, collapsed) {
  const result = applyBubbleKeyboardFocus(
    targetWindow,
    enabled,
    collapsed,
    petSettings.alwaysOnTop,
  )
  applyPetTopmost(targetWindow)
  if (targetWindow !== petWindow) applyPetTopmost(petWindow)
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
    if (!targetWindow.isDestroyed()) targetWindow.webContents.send("eden-agent-auth-state", state)
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

app.setName("Eden Agent")
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")
if (process.platform === "win32") {
  app.setAppUserModelId("com.mon.edenagent")
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "edenagent-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

async function coreRequest(endpoint, init = {}) {
  const baseUrl = resolveCoreBaseUrl()
  const started = Date.now()
  const response = await fetch(`${baseUrl}${endpoint}`, init).catch((error) => {
    console.error(`[Eden Agent][CoreBridge][ERROR] ${init.method ?? "GET"} ${endpoint} failed: ${error}`)
    throw new Error(`请求 MonCore 接口失败: ${error.message || error}`)
  })

  console.log(
    `[Eden Agent][CoreBridge][INFO] ${init.method ?? "GET"} ${endpoint} -> ${response.status} ${Date.now() - started}ms`,
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
  const layout = calculatePetWindowLayout(
    petSettings,
    display.workArea,
    undefined,
    { previousIconPlacement: petIconPlacement },
  )
  petIconPlacement = layout.iconPlacement
  return layout
}

function applyPetWindowAttributes() {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setSkipTaskbar(true)
    makeWindowNonActivating(petWindow, process.platform)
    applyPetTopmost(petWindow)
    petWindow.setOpacity(1)
    const workAreaHost = usesPetWorkAreaHost(process.platform)
    petWindow.setBackgroundColor(workAreaHost || petSettings.transparentWindow ? "#00000000" : "#f5f5f4")
    petWindow.setHasShadow(!workAreaHost && !petSettings.transparentWindow)
    petMousePassthrough.apply()
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
  // Interaction surfaces are independent floating windows. Reassert the
  // character's higher level last to keep it above both surfaces.
  applyPetTopmost(petWindow)
  syncGlobalPointerObserver()
}

function applyPetBubbleBounds() {
  const layout = petWindowLayout()
  if (petBubbleWindow && !petBubbleWindow.isDestroyed()) {
    petBubbleWindow.setBounds(layout.expandedBubble, false)
  }
  if (petBubbleIconWindow && !petBubbleIconWindow.isDestroyed()) {
    petBubbleIconWindow.setBounds(layout.collapsedBubble, false)
    if (!petBubbleIconWindow.webContents.isDestroyed()) {
      petBubbleIconWindow.webContents.send("eden-agent-pet-icon-placement", layout.iconPlacement)
    }
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
  applyPetTopmost(petBubbleWindow)
  applyPetTopmost(petBubbleIconWindow)
  applyPetTopmost(petWindow)
}

function syncPetCharacterViewport(nextViewport) {
  if (!petWindow || petWindow.isDestroyed()) return
  if (sameCharacterViewport(nextViewport, petCharacterViewport)) return
  petCharacterViewport = nextViewport
  if (!petWindow.webContents.isDestroyed()) {
    petWindow.webContents.send("eden-agent-pet-character-viewport", petCharacterViewport)
  }
}

function applyPetWindowBounds() {
  if (!petWindow || petWindow.isDestroyed()) return

  const layout = petWindowLayout()
  const hostLayout = calculatePetWindowHostLayout(layout.character, layout.workArea, process.platform)
  const hostBounds = hostLayout.hostBounds
  petWindow.setMinimumSize(1, 1)
  petWindow.setMaximumSize(100000, 100000)
  applyingPetBounds = true
  if (!sameBounds(petWindow.getBounds(), hostBounds)) petWindow.setBounds(hostBounds, false)
  syncPetCharacterViewport(hostLayout.characterViewport)
  if (usesPetWorkAreaHost(process.platform) && typeof petWindow.setShape === "function") {
    petWindow.setShape(hostLayout.shape)
  }
  petMousePassthrough.reapplyAfterBoundsChange()
  applyPetBubbleBounds()
  if (petBoundsSettleTimer) clearTimeout(petBoundsSettleTimer)
  petBoundsSettleTimer = setTimeout(() => {
    petBoundsSettleTimer = null
    applyingPetBounds = false
  }, 250)
}

function applyPetWindowSettings() {
  applyPetWindowBounds()
  applyPetWindowAttributes()
  applyPetBubbleVisibility()
}

function savePetWindowPosition() {
  if (!petWindow || applyingPetBounds || petGroupDrag || usesPetWorkAreaHost(process.platform)) return
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
  mainWindow?.webContents.send("eden-agent-pet-settings", petSettings)
  petWindow?.webContents.send("eden-agent-pet-settings", petSettings)
  petBubbleWindow?.webContents.send("eden-agent-pet-settings", petSettings)
  petBubbleIconWindow?.webContents.send("eden-agent-pet-settings", petSettings)
  settingsWindow?.webContents.send("eden-agent-pet-settings", petSettings)
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
      targetWindow.webContents.send("eden-agent-pet-bubble-collapsed", petBubbleCollapsed)
    }
  }
}

async function broadcastDesktopEnvironment() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return
  const display = displayForPetSettings(settingsWindow)
  const environment = await desktopEnvironmentService.read(display)
  if (!settingsWindow || settingsWindow.isDestroyed()) return
  settingsWindow.webContents.send("eden-agent-desktop-environment", environment)
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

function updatePetSettings(input, options = {}) {
  const persist = options.persist !== false
  const broadcast = options.broadcast !== false
  const previousSettings = petSettings
  petSettings = normalizePetSettings({ ...petSettings, ...input })
  if (persist) petSettingsStore.write(petSettings)
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
  if (broadcast) broadcastPetSettings()
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

function attachRendererDiagnostics(targetWindow, label) {
  const contents = targetWindow.webContents
  contents.on("render-process-gone", (_event, details) => {
    speechPlaybackCoordinator.revokeOwner(contents.id, "renderer-gone")
    if (!app.isPackaged) report(`process gone: ${details.reason} (${details.exitCode})`)
  })
  if (app.isPackaged) return
  const report = (message) => {
    const line = `[${new Date().toISOString()}] [${label}] ${message}`
    console.error(`[Eden Agent][Renderer] ${line}`)
    try {
      const diagnosticsDir = path.join(agentRoot, ".artifacts")
      fs.mkdirSync(diagnosticsDir, { recursive: true })
      fs.appendFileSync(path.join(diagnosticsDir, "renderer-diagnostics.log"), `${line}\n`, "utf8")
    } catch (error) {
      console.error(`[Eden Agent][Renderer] unable to write diagnostics: ${error.message || error}`)
    }
  }
  contents.on("console-message", (event, ...args) => {
    const message = rendererConsoleError(event, args)
    if (message) report(message)
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
    if (!isQuitting && !quitFlagController.hasQuitFlag()) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  attachRendererDiagnostics(mainWindow, "main")
  attachWindowActivityEvents(mainWindow, "main")
  if (!app.isPackaged && process.env.EDEN_AGENT_OPEN_DEVTOOLS === "1") {
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
    title: "Eden Agent 用户决策",
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
  const layout = petWindowLayout()
  const hostLayout = calculatePetWindowHostLayout(layout.character, layout.workArea, process.platform)
  const bounds = hostLayout.hostBounds
  petCharacterViewport = hostLayout.characterViewport
  petWindow = new BrowserWindow({
    title: `${APP_WINDOW_TITLE} 桌宠角色`,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1,
    minHeight: 1,
    resizable: !usesPetWorkAreaHost(process.platform),
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    transparent: true,
    // A Linux `dock` or non-focusable BrowserWindow becomes unmanaged under
    // X11/Cinnamon, which prevents always-on-top from surviving application
    // switches. Keep a normal managed window there and suppress activation in
    // the event handlers below.
    focusable: process.platform === "linux",
    skipTaskbar: true,
    alwaysOnTop: petSettings.alwaysOnTop,
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
  petWindow.on("focus", () => {
    if (process.platform !== "linux") return
    petWindow?.blur()
    applyPetTopmost(petWindow)
  })
  petWindow.on("hide", () => {
    globalPointerObserver.setEnabled(false)
    petBubbleKeyboardFocus = false
    setWindowVisibleWithoutActivation(petBubbleWindow, false)
    setWindowVisibleWithoutActivation(petBubbleIconWindow, false)
    updateTray()
  })
  petWindow.on("closed", () => {
    globalPointerObserver.setEnabled(false)
    petGroupDrag = null
    if (petBoundsSettleTimer) clearTimeout(petBoundsSettleTimer)
    petBoundsSettleTimer = null
    petCharacterViewport = { mode: "window", x: 0, y: 0, width: 1, height: 1 }
    petMousePassthrough.cancelPending()
    petWindow = null
    if (petBubbleWindow && !petBubbleWindow.isDestroyed()) petBubbleWindow.destroy()
    if (petBubbleIconWindow && !petBubbleIconWindow.isDestroyed()) petBubbleIconWindow.destroy()
    updateTray()
  })
  petWindow.on("move", () => {
    if (!usesPetWorkAreaHost(process.platform)) savePetWindowPosition()
    petMousePassthrough.reapplyAfterBoundsChange()
  })
  petWindow.on("resize", () => {
    petMousePassthrough.reapplyAfterBoundsChange()
  })
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
    // The expanded bubble must remain an ordinary window on Linux. A `dock`
    // window may contain a focusable DOM input, but KWin intentionally keeps
    // keyboard focus on the previously active application.
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
    // Electron cannot change focusability at runtime on Linux. Keep the
    // expanded input surface natively focusable there and control activation
    // with blur/focus instead.
    focusable: process.platform === "linux",
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
    applyPetTopmost(petBubbleWindow)
    applyPetTopmost(petWindow)
  })
  petBubbleWindow.on("blur", () => {
    if (!petBubbleKeyboardFocus) return
    if (petBubbleBlurTimer) clearTimeout(petBubbleBlurTimer)
    // Native style changes can emit a transient blur on KWin. Defer the
    // no-activate transition so a focus immediately restored by Electron is
    // not mistaken for the user leaving the input.
    petBubbleBlurTimer = setTimeout(() => {
      petBubbleBlurTimer = null
      if (!petBubbleWindow || petBubbleWindow.isDestroyed() || petBubbleWindow.isFocused()) return
      petBubbleKeyboardFocus = false
      applyPetBubbleKeyboardFocus(petBubbleWindow, false, petBubbleCollapsed)
    }, 50)
  })
  const petBubbleContentsId = petBubbleWindow.webContents.id
  petBubbleWindow.on("hide", () => {
    petBubbleKeyboardFocus = false
    // Hiding a renderer does not destroy its audio context. Let the current
    // sentence finish; revoking here used to cut speech off mid-sentence.
    speechDiagnostics.append("desktop", "pet-bubble-hidden", {
      ownerId: petBubbleContentsId,
      activeLease: speechPlaybackCoordinator.snapshot(),
    })
  })
  petBubbleWindow.on("closed", () => {
    if (petBubbleBlurTimer) clearTimeout(petBubbleBlurTimer)
    petBubbleBlurTimer = null
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
    // Like the character host, a non-focusable Linux window becomes
    // override-redirect and escapes the explicit stacking hierarchy.
    focusable: process.platform === "linux",
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
    applyPetTopmost(petBubbleIconWindow)
    applyPetTopmost(petWindow)
  })
  petBubbleIconWindow.on("focus", () => {
    if (process.platform !== "linux") return
    petBubbleIconWindow?.blur()
    applyPetTopmost(petBubbleIconWindow)
    applyPetTopmost(petWindow)
  })
  petBubbleIconWindow.on("closed", () => {
    petGroupDrag = null
    petBubbleIconWindow = null
  })
  attachWindowActivityEvents(petBubbleIconWindow, "pet-icon")
  loadWebApp(petBubbleIconWindow, "pet-icon")
}

function hidePetWindows() {
  globalPointerObserver.setEnabled(false)
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
    title: "Eden Agent 设置",
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

function watchQuitFlag() {
  setInterval(() => {
    if (!quitFlagController.hasQuitFlag()) return
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
    ...createWindowCommandHandlers({ BrowserWindow, dialog, shell, getMainWindow: () => mainWindow }),
    get_local_runtime_config: () => localRuntimeService.read(),
    test_local_runtime_config: ({ args }) => localRuntimeService.testConnection(args.config ?? {}),
    save_local_runtime_config: ({ args }) => localRuntimeService.saveAndRestart(args.config ?? {}),
    save_local_character_config: ({ args }) => localRuntimeService.saveCharacter(args.character ?? {}),
    open_local_runtime_config_directory: async () => {
      if (!shell?.openPath) return false
      return (await shell.openPath(path.dirname(localRuntimeConfig.filePath))) === ""
    },
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
        if (error) console.warn("[Eden Agent][Performance] 写入诊断日志失败", error)
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
    authorize_automatic_speech_synthesis: ({ sender }) => {
      const surface = speechSurfaceForSender(sender)
      return Boolean(surface && surface === preferredAutomaticSpeechSurface())
    },
    release_speech_playback: ({ sender, args }) => {
      return speechPlaybackCoordinator.release(
        sender.id,
        String(args.leaseId || ""),
        args.outcome === "completed" ? "completed" : "interrupted",
      )
    },
    report_speech_diagnostic: ({ sender, args }) => {
      const surface = speechSurfaceForSender(sender) || "unsupported"
      return speechDiagnostics.append("renderer", args.event, {
        ownerId: sender.id,
        surface,
        ...(args.details && typeof args.details === "object" ? args.details : {}),
      })
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
    get_pet_icon_placement: () => petIconPlacement,
    get_pet_character_viewport: () => petCharacterViewport,
    apply_pet_settings: ({ args }) => updatePetSettings(args.settings ?? {}),
    preview_pet_settings: ({ args }) => updatePetSettings(
      args.settings ?? {},
      { persist: false, broadcast: false },
    ),
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
      if (petBubbleBlurTimer) clearTimeout(petBubbleBlurTimer)
      petBubbleBlurTimer = null
      petBubbleKeyboardFocus = Boolean(args.enabled) && !petBubbleCollapsed && petBubbleWindow.isVisible()
      return applyPetBubbleKeyboardFocus(petBubbleWindow, petBubbleKeyboardFocus, petBubbleCollapsed)
    },
    begin_pet_group_drag: ({ sender, args }) => {
      const targetWindow = BrowserWindow.fromWebContents(sender)
      const draggingCollapsedIcon = targetWindow === petBubbleIconWindow && petBubbleCollapsed
      const draggingCharacter = targetWindow === petWindow && petSettings.characterDraggable
      if (!draggingCollapsedIcon && !draggingCharacter) return false
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

const allowMultipleInstances = process.env.EDEN_AGENT_ALLOW_MULTIPLE_INSTANCES === "true"

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
    rustServer.start()
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
    if (process.env.EDEN_AGENT_DESKTOP_START_PAGE === "settings") {
      void createSettingsWindow()
    } else if (process.env.EDEN_AGENT_DESKTOP_START_PAGE === "pet") {
      void createPetWindow()
    }
    createTray()
  })

  app.on("before-quit", () => {
    isQuitting = true
    globalPointerObserver.dispose()
    stopActivityPresence()
    processLifecycle.stopDevParentWatch()
    rustServer.stop()

    stopDesktopEnvironmentMonitors()
  })

  app.on("window-all-closed", (event) => {
    event.preventDefault()
  })
}
