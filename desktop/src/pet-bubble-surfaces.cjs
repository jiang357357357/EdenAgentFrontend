function resolvePetBubbleSurfaceVisibility({ characterVisible, showInput, collapsed }) {
  const interactionVisible = Boolean(characterVisible && showInput)
  return {
    panelVisible: interactionVisible && !collapsed,
    iconVisible: interactionVisible && Boolean(collapsed),
  }
}

function setWindowVisibleWithoutActivation(targetWindow, visible) {
  if (!targetWindow || targetWindow.isDestroyed()) return false
  if (visible) {
    targetWindow.setSkipTaskbar(true)
    if (!targetWindow.isVisible()) targetWindow.showInactive()
  } else if (targetWindow.isVisible()) {
    targetWindow.hide()
  }
  return true
}

module.exports = {
  resolvePetBubbleSurfaceVisibility,
  setWindowVisibleWithoutActivation,
}
