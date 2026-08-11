const DEFAULT_SETTLE_DELAY_MS = 250

function usableWindow(targetWindow) {
  return Boolean(targetWindow && !targetWindow.isDestroyed())
}

function createPetMousePassthroughController({
  getWindow,
  getClickThrough,
  settleDelayMs = DEFAULT_SETTLE_DELAY_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let settleTimer = null

  function apply() {
    const targetWindow = getWindow?.()
    if (!usableWindow(targetWindow)) return false
    targetWindow.setIgnoreMouseEvents(Boolean(getClickThrough?.()))
    return true
  }

  function cancelPending() {
    if (settleTimer === null) return
    clearTimer(settleTimer)
    settleTimer = null
  }

  function reapplyAfterBoundsChange() {
    // On Linux/X11, Chromium recreates the native input region asynchronously
    // after a move/resize. Apply once now for other platforms and once after the
    // native bounds have settled so the character stays click-through.
    apply()
    cancelPending()
    settleTimer = setTimer(() => {
      settleTimer = null
      apply()
    }, settleDelayMs)
  }

  return {
    apply,
    cancelPending,
    reapplyAfterBoundsChange,
  }
}

module.exports = {
  DEFAULT_SETTLE_DELAY_MS,
  createPetMousePassthroughController,
}
