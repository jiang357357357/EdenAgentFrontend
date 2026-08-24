const fs = require("node:fs")

const POINTER_EVENT_CHANNEL = "eden-agent-global-pet-pointer"

function parseJsonLines(remainder, chunk) {
  const text = `${remainder || ""}${chunk || ""}`
  const lines = text.split(/\r?\n/)
  const nextRemainder = lines.pop() || ""
  const records = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      records.push(JSON.parse(trimmed))
    } catch {
      // Ignore malformed helper output instead of destabilizing Electron.
    }
  }
  return { records, remainder: nextRemainder }
}

function pointInsideBounds(point, bounds) {
  return Boolean(
    point && bounds &&
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= bounds.x && point.x < bounds.x + bounds.width &&
    point.y >= bounds.y && point.y < bounds.y + bounds.height,
  )
}

function pointerPayload(phase, point, bounds) {
  if (!point || !bounds) return null
  return {
    phase,
    pointerId: 1,
    button: 0,
    clientX: point.x - bounds.x,
    clientY: point.y - bounds.y,
    screenX: point.x,
    screenY: point.y,
    time: Date.now(),
  }
}

function createGlobalPointerObserver(options = {}) {
  const platform = options.platform ?? process.platform
  const executablePath = options.executablePath
  const fileExists = options.fileExists ?? fs.existsSync
  const spawnProcess = options.spawnProcess
  const getCursorPoint = options.getCursorPoint
  const getTargetWindow = options.getTargetWindow
  const logger = options.logger ?? console
  const pollIntervalMs = Math.max(8, Number(options.pollIntervalMs) || 16)
  const restartDelayMs = Math.max(250, Number(options.restartDelayMs) || 1500)
  const setIntervalFn = options.setIntervalFn ?? setInterval
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout

  let desired = false
  let child = null
  let stdoutRemainder = ""
  let activePointer = false
  let pollTimer = null
  let restartTimer = null
  let generation = 0
  let missingBinaryReported = false

  function targetWindow() {
    const target = getTargetWindow?.()
    if (!target || target.isDestroyed?.() || !target.isVisible?.()) return null
    if (!target.webContents || target.webContents.isDestroyed?.()) return null
    return target
  }

  function sendAtCursor(phase, allowOutside = false) {
    const target = targetWindow()
    const point = getCursorPoint?.()
    if (!target || !point) return false
    const bounds = target.getBounds()
    if (!allowOutside && !pointInsideBounds(point, bounds)) return false
    const payload = pointerPayload(phase, point, bounds)
    if (!payload) return false
    target.webContents.send(POINTER_EVENT_CHANNEL, payload)
    return true
  }

  function cancelActivePointer() {
    if (!activePointer) return
    sendAtCursor("cancel", true)
    activePointer = false
  }

  function handleRecord(record) {
    if (!record || record.button && record.button !== "left") return
    if (record.type === "down") {
      cancelActivePointer()
      activePointer = sendAtCursor("down")
    } else if (record.type === "up" && activePointer) {
      sendAtCursor("up", true)
      activePointer = false
    }
  }

  function ensurePollTimer() {
    if (pollTimer) return
    pollTimer = setIntervalFn(() => {
      if (desired && activePointer) sendAtCursor("move", true)
    }, pollIntervalMs)
    pollTimer.unref?.()
  }

  function clearRestartTimer() {
    if (!restartTimer) return
    clearTimeoutFn(restartTimer)
    restartTimer = null
  }

  function scheduleRestart(expectedGeneration) {
    if (!desired || restartTimer || expectedGeneration !== generation) return
    restartTimer = setTimeoutFn(() => {
      restartTimer = null
      if (desired && expectedGeneration === generation) start()
    }, restartDelayMs)
    restartTimer.unref?.()
  }

  function start() {
    if (!desired || child || platform !== "win32") return false
    if (!executablePath || !fileExists(executablePath)) {
      if (!missingBinaryReported) {
        missingBinaryReported = true
        logger.warn?.(`[Eden Agent][PointerObserver] helper not found: ${executablePath || "unconfigured"}`)
      }
      return false
    }

    const childGeneration = generation
    stdoutRemainder = ""
    try {
      child = spawnProcess(executablePath, [], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      })
    } catch (error) {
      child = null
      logger.warn?.(`[Eden Agent][PointerObserver] failed to start: ${error.message}`)
      scheduleRestart(childGeneration)
      return false
    }

    child.stdout?.setEncoding?.("utf8")
    child.stderr?.setEncoding?.("utf8")
    child.stdout?.on?.("data", (chunk) => {
      const parsed = parseJsonLines(stdoutRemainder, chunk)
      stdoutRemainder = parsed.remainder
      for (const record of parsed.records) handleRecord(record)
    })
    child.stderr?.on?.("data", (chunk) => {
      const message = String(chunk).trim()
      if (message) logger.warn?.(`[Eden Agent][PointerObserver] ${message}`)
    })
    child.on?.("error", (error) => {
      logger.warn?.(`[Eden Agent][PointerObserver] process error: ${error.message}`)
    })
    child.on?.("exit", (code, signal) => {
      if (childGeneration !== generation) return
      child = null
      cancelActivePointer()
      if (desired) {
        logger.warn?.(`[Eden Agent][PointerObserver] exited (${code ?? signal ?? "unknown"}); retrying`)
        scheduleRestart(childGeneration)
      }
    })
    ensurePollTimer()
    return true
  }

  function stop() {
    generation += 1
    clearRestartTimer()
    cancelActivePointer()
    if (pollTimer) {
      clearIntervalFn(pollTimer)
      pollTimer = null
    }
    const previous = child
    child = null
    stdoutRemainder = ""
    try {
      previous?.kill?.()
    } catch {
      // The helper may already have exited.
    }
  }

  return {
    setEnabled(enabled) {
      const next = platform === "win32" && Boolean(enabled)
      if (desired === next) {
        if (next && !child) start()
        return next
      }
      desired = next
      if (desired) start()
      else stop()
      return desired
    },
    dispose() {
      desired = false
      stop()
    },
    snapshot() {
      return { desired, running: Boolean(child), activePointer }
    },
  }
}

module.exports = {
  POINTER_EVENT_CHANNEL,
  createGlobalPointerObserver,
  parseJsonLines,
  pointInsideBounds,
  pointerPayload,
}
