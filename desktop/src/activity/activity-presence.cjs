function quotedXPropertyValues(text) {
  return Array.from(String(text || "").matchAll(/"([^"]*)"/g), (match) => match[1])
}

async function readForegroundWindowFacts({ platform, environment, execFileAsync, readText }) {
  if (platform !== "linux") {
    return {
      available: false,
      application_name: null,
      process_name: null,
      window_title: null,
      fullscreen: null,
      error: `当前平台 ${platform} 尚未接入活动窗口采集器`,
    }
  }
  if (String(environment.XDG_SESSION_TYPE || "").toLowerCase() === "wayland") {
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
    const lines = output.split(/\r?\n/)
    const wmClassLine = lines.find((line) => line.startsWith("WM_CLASS")) || ""
    const windowNameLine = lines.find((line) => line.startsWith("_NET_WM_NAME"))
      || lines.find((line) => line.startsWith("WM_NAME"))
      || ""
    const applicationName = quotedXPropertyValues(wmClassLine).at(-1) || null
    const windowTitle = quotedXPropertyValues(windowNameLine).at(-1) || null
    let processName = null
    if (Number.isSafeInteger(pid) && pid > 0) processName = readText(`/proc/${pid}/comm`).trim() || null
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

function combinedRendererActivityFacts(rendererActivityFacts) {
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

function usableWindow(targetWindow) {
  return Boolean(targetWindow && !targetWindow.isDestroyed())
}

function createActivityPresenceService({
  platform = process.platform,
  environment = process.env,
  execFileAsync,
  readText,
  powerMonitor,
  getWindows,
  getCurrentViewMode,
  coreRequest,
  authHeader,
  isQuitting,
  logger = console,
  now = () => new Date(),
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  let token = ""
  let clientId = ""
  let heartbeatTimer = null
  let publishInFlight = false
  let publishQueued = false
  let systemSuspended = false
  const rendererActivityFacts = new Map()
  const recentActivityEvents = []

  function recordActivityEvent(type, details = {}) {
    recentActivityEvents.push({ type, occurred_at: now().toISOString(), ...details })
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

  async function collectActivityPresenceFacts() {
    const foregroundWindow = await readForegroundWindowFacts({ platform, environment, execFileAsync, readText })
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
    const rendererFacts = combinedRendererActivityFacts(rendererActivityFacts)
    const windows = getWindows()
    return {
      captured_at: now().toISOString(),
      system_input: { idle_seconds: idleSeconds },
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
        main_window_visible: usableWindow(windows.mainWindow) && windows.mainWindow.isVisible(),
        main_window_focused: usableWindow(windows.mainWindow) && windows.mainWindow.isFocused(),
        pet_visible: usableWindow(windows.petWindow) && windows.petWindow.isVisible(),
        bubble_visible:
          (usableWindow(windows.petBubbleWindow) && windows.petBubbleWindow.isVisible()) ||
          (usableWindow(windows.petBubbleIconWindow) && windows.petBubbleIconWindow.isVisible()),
        settings_window_visible: usableWindow(windows.settingsWindow) && windows.settingsWindow.isVisible(),
        current_view_mode: getCurrentViewMode(),
        ...rendererFacts,
      },
      recent_events: recentActivityEvents.slice(-12),
      sources: {
        system_input: "electron.powerMonitor",
        session: "electron.powerMonitor",
        foreground_window: platform === "linux" ? "linux.x11.xprop" : `electron.${platform}`,
        monagent: "electron",
        media: "unavailable",
      },
      collection_errors: collectionErrors,
    }
  }

  async function publishActivityPresence() {
    if (!token || isQuitting()) return false
    if (publishInFlight) {
      publishQueued = true
      return false
    }
    publishInFlight = true
    try {
      const payload = await collectActivityPresenceFacts()
      await coreRequest("/api/users/me/activity-presence/", {
        method: "PUT",
        headers: {
          ...authHeader(token),
          "content-type": "application/json",
          ...(clientId ? { "X-MON-CLIENT-ID": clientId } : {}),
        },
        body: JSON.stringify(payload),
      })
      return true
    } catch (error) {
      if (!isQuitting()) logger.warn(`[MonAgent][ActivityPresence][WARN] 上报失败: ${error?.message || error}`)
      return false
    } finally {
      publishInFlight = false
      if (publishQueued) {
        publishQueued = false
        setTimeoutFn(() => void publishActivityPresence(), 250)
      }
    }
  }

  function startActivityPresence(nextToken, nextClientId = "") {
    token = String(nextToken || "")
    clientId = String(nextClientId || "")
    if (heartbeatTimer) clearIntervalFn(heartbeatTimer)
    heartbeatTimer = setIntervalFn(() => void publishActivityPresence(), 60_000)
    heartbeatTimer.unref?.()
    void publishActivityPresence()
  }

  function stopActivityPresence() {
    token = ""
    clientId = ""
    if (heartbeatTimer) clearIntervalFn(heartbeatTimer)
    heartbeatTimer = null
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

  return {
    attachWindowActivityEvents,
    collectActivityPresenceFacts,
    publishActivityPresence,
    startActivityPresence,
    startActivityPresenceSystemEvents,
    stopActivityPresence,
    updateRendererActivityFacts,
  }
}

module.exports = {
  combinedRendererActivityFacts,
  createActivityPresenceService,
  quotedXPropertyValues,
  readForegroundWindowFacts,
}
