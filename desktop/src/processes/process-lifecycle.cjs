function isOutputPipeError(error) {
  return error?.code === "EPIPE" || error?.code === "ERR_STREAM_DESTROYED"
}

function createProcessLifecycle({
  app,
  processObject = process,
  getIsQuitting = () => false,
  markQuitting = () => {},
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  scheduleImmediate = setImmediate,
  watchIntervalMs = 750,
} = {}) {
  if (!app?.quit) throw new TypeError("app.quit is required")

  let devParentWatchTimer = null

  function requestQuit() {
    if (getIsQuitting()) return false
    markQuitting()
    app.quit()
    return true
  }

  function handleOutputError(error) {
    if (!isOutputPipeError(error)) {
      scheduleImmediate(() => { throw error })
      return false
    }
    return requestQuit()
  }

  function registerOutputErrorHandlers() {
    processObject.stdout?.on?.("error", handleOutputError)
    processObject.stderr?.on?.("error", handleOutputError)
  }

  function stopDevParentWatch() {
    if (!devParentWatchTimer) return false
    clearIntervalFn(devParentWatchTimer)
    devParentWatchTimer = null
    return true
  }

  function startDevParentWatch() {
    const parentPid = Number(processObject.env?.MON_AGENT_DEV_PARENT_PID)
    if (!Number.isSafeInteger(parentPid) || parentPid <= 1 || devParentWatchTimer) return false
    devParentWatchTimer = setIntervalFn(() => {
      try {
        processObject.kill(parentPid, 0)
      } catch {
        stopDevParentWatch()
        requestQuit()
      }
    }, watchIntervalMs)
    devParentWatchTimer.unref?.()
    return true
  }

  return {
    handleOutputError,
    registerOutputErrorHandlers,
    startDevParentWatch,
    stopDevParentWatch,
  }
}

module.exports = { createProcessLifecycle, isOutputPipeError }
