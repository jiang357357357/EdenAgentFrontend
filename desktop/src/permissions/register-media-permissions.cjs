const { shouldAllowMediaPermission } = require("./media-permission-policy.cjs")

function createMediaAccessResolver({ BrowserWindow, getMainWindow, getPetBubbleWindow }) {
  return (webContents) => {
    if (!webContents) return { allowAudio: false, allowVideo: false }

    const owner = BrowserWindow.fromWebContents(webContents)
    const mainWindow = getMainWindow()
    const petBubbleWindow = getPetBubbleWindow()
    const isMainWindow = Boolean(mainWindow && !mainWindow.isDestroyed() && owner === mainWindow)
    const isPetBubbleWindow = Boolean(
      petBubbleWindow && !petBubbleWindow.isDestroyed() && owner === petBubbleWindow,
    )
    return {
      allowAudio: isMainWindow || isPetBubbleWindow,
      // Camera capture is handled only by the primary chat surface.
      allowVideo: isMainWindow,
    }
  }
}

function registerMediaPermissions({ defaultSession, BrowserWindow, getMainWindow, getPetBubbleWindow }) {
  if (!defaultSession) throw new TypeError("defaultSession is required")

  const mediaAccessForContents = createMediaAccessResolver({
    BrowserWindow,
    getMainWindow,
    getPetBubbleWindow,
  })

  defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details = {}) => {
    return shouldAllowMediaPermission({
      permission,
      mediaType: details.mediaType,
      ...mediaAccessForContents(webContents),
    })
  })

  defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    callback(shouldAllowMediaPermission({
      permission,
      mediaTypes: details.mediaTypes,
      ...mediaAccessForContents(webContents),
    }))
  })
}

module.exports = { createMediaAccessResolver, registerMediaPermissions }
