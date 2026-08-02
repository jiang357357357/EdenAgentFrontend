const path = require("node:path")

function defaultBindingLoader() {
  return require(path.join(__dirname, "..", "..", "native", "win32-noactivate", "build", "Release", "monagent_noactivate.node"))
}

function createWindowsNoActivateController({
  platform = process.platform,
  bindingLoader = defaultBindingLoader,
  logger = console,
} = {}) {
  let binding = null
  let loadAttempted = false
  let failureReported = false

  function reportFailure(error) {
    if (failureReported) return
    failureReported = true
    logger.error(`[MonAgent][NoActivate] native policy unavailable: ${error?.message || error}`)
  }

  function getBinding() {
    if (platform !== "win32") return null
    if (loadAttempted) return binding
    loadAttempted = true
    try {
      binding = bindingLoader()
    } catch (error) {
      reportFailure(error)
    }
    return binding
  }

  function apply(targetWindow, enabled) {
    if (platform !== "win32") return false
    if (!targetWindow || targetWindow.isDestroyed()) return false
    const nativeBinding = getBinding()
    if (!nativeBinding) return false
    try {
      return Boolean(nativeBinding.setNoActivate(targetWindow.getNativeWindowHandle(), Boolean(enabled)))
    } catch (error) {
      reportFailure(error)
      return false
    }
  }

  function applyTopmost(targetWindow, enabled) {
    if (platform !== "win32") return false
    if (!targetWindow || targetWindow.isDestroyed()) return false
    const nativeBinding = getBinding()
    if (!nativeBinding) return false
    try {
      return Boolean(nativeBinding.setTopmost(targetWindow.getNativeWindowHandle(), Boolean(enabled)))
    } catch (error) {
      reportFailure(error)
      return false
    }
  }

  return { apply, applyTopmost }
}

module.exports = {
  createWindowsNoActivateController,
}
