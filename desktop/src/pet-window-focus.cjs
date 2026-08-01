function canControlWindow(targetWindow) {
  return Boolean(targetWindow && !targetWindow.isDestroyed())
}

function makeWindowNonActivating(targetWindow) {
  if (!canControlWindow(targetWindow)) return false
  if (targetWindow.isFocused()) targetWindow.blur()
  if (targetWindow.isFocusable()) targetWindow.setFocusable(false)
  return true
}

function applyBubbleKeyboardFocus(targetWindow, enabled, collapsed, alwaysOnTop = false) {
  if (!canControlWindow(targetWindow)) return false
  const active = Boolean(enabled && !collapsed)
  let focusabilityChanged = false
  if (!active) {
    if (targetWindow.isFocused()) targetWindow.blur()
    if (targetWindow.isFocusable()) {
      targetWindow.setFocusable(false)
      focusabilityChanged = true
    }
  } else {
    if (!targetWindow.isFocusable()) {
      targetWindow.setFocusable(true)
      focusabilityChanged = true
    }
    if (!targetWindow.isVisible()) targetWindow.showInactive()
    if (!targetWindow.isFocused()) targetWindow.focus()
  }

  const requestedTopmost = Boolean(alwaysOnTop)
  // Changing WS_EX_NOACTIVATE/focusable can cause Windows to drop the native
  // topmost placement while Electron's cached value still says otherwise.
  // Re-assert it only when that native style actually changed.
  if (focusabilityChanged || targetWindow.isAlwaysOnTop() !== requestedTopmost) {
    targetWindow.setAlwaysOnTop(requestedTopmost)
  }
  return active
}

module.exports = {
  applyBubbleKeyboardFocus,
  makeWindowNonActivating,
}
