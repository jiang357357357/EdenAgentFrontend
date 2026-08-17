function canControlWindow(targetWindow) {
  return Boolean(targetWindow && !targetWindow.isDestroyed())
}

function makeWindowNonActivating(targetWindow, platform = process.platform) {
  if (!canControlWindow(targetWindow)) return false
  if (targetWindow.isFocused()) targetWindow.blur()
  // On X11, changing an Electron window to non-focusable also makes it an
  // override-redirect window. Cinnamon then stops managing its stacking
  // state, so a later application can cover the character even when Electron
  // still reports it as always-on-top. Keep the native window focusable on
  // Linux and prevent activation by showing it inactive and immediately
  // blurring any incidental focus instead.
  if (platform !== "linux" && targetWindow.isFocusable()) {
    targetWindow.setFocusable(false)
  }
  return true
}

function reassertWindowTopmost(targetWindow, enabled, level = "screen-saver") {
  if (!canControlWindow(targetWindow)) return false
  const topmost = Boolean(enabled)
  if (topmost) {
    // Do not trust Electron's cached isAlwaysOnTop() value here. Showing or
    // focusing another native surface can change the actual window-manager order.
    targetWindow.setAlwaysOnTop(true, level)
    if (targetWindow.isVisible() && typeof targetWindow.moveTop === "function") {
      targetWindow.moveTop()
    }
  } else {
    targetWindow.setAlwaysOnTop(false)
  }
  return true
}

function applyBubbleKeyboardFocus(
  targetWindow,
  enabled,
  collapsed,
  alwaysOnTop = false,
  platform = process.platform,
) {
  if (!canControlWindow(targetWindow)) return false
  const active = Boolean(enabled && !collapsed)
  // Electron only supports changing focusability at runtime on macOS and
  // Windows. Linux bubbles must be created focusable and retain that native
  // capability; blur/focus controls activation without mutating it.
  const mutableFocusability = platform === "darwin" || platform === "win32"
  let focusabilityChanged = false
  if (!active) {
    if (targetWindow.isFocused()) targetWindow.blur()
    if (mutableFocusability && targetWindow.isFocusable()) {
      targetWindow.setFocusable(false)
      focusabilityChanged = true
    }
  } else {
    if (mutableFocusability && !targetWindow.isFocusable()) {
      targetWindow.setFocusable(true)
      focusabilityChanged = true
    }
    if (!targetWindow.isVisible()) targetWindow.showInactive()
  }

  const requestedTopmost = Boolean(alwaysOnTop)
  // Changing WS_EX_NOACTIVATE/focusable can cause Windows to drop the native
  // topmost placement while Electron's cached value still says otherwise.
  // Re-assert it only when that native style actually changed.
  if (focusabilityChanged || targetWindow.isAlwaysOnTop() !== requestedTopmost) {
    targetWindow.setAlwaysOnTop(requestedTopmost)
  }
  // On Linux, changing focusability or the topmost state after focus() can
  // produce a transient blur. The bubble's blur handler intentionally returns
  // it to no-activate mode, so focus must be the final native-window mutation
  // when text input is requested.
  if (active && !targetWindow.isFocused()) targetWindow.focus()
  return active
}

module.exports = {
  applyBubbleKeyboardFocus,
  makeWindowNonActivating,
  reassertWindowTopmost,
}
