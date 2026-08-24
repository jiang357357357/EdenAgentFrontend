const { contextBridge, ipcRenderer } = require("electron")
const { desktopFileUrl, resolveBundledWebAssetPath } = require("./protocols/file-protocol.cjs")

function convertFileSrc(filePath) {
  return desktopFileUrl(resolveBundledWebAssetPath(filePath, {
    preloadDirectory: __dirname,
    isPackaged: !process.defaultApp,
  }))
}

contextBridge.exposeInMainWorld("monAgentDesktop", {
  getAgentCapability() {
    return ipcRenderer.invoke("mon-agent:capability")
  },
  invoke(command, args) {
    return ipcRenderer.invoke("mon-agent:invoke", command, args ?? {})
  },
  onViewMode(callback) {
    const handler = (_event, mode) => callback(mode)
    ipcRenderer.on("mon-agent-view-mode", handler)
    return () => ipcRenderer.removeListener("mon-agent-view-mode", handler)
  },
  onPetSettings(callback) {
    const handler = (_event, settings) => callback(settings)
    ipcRenderer.on("mon-agent-pet-settings", handler)
    return () => ipcRenderer.removeListener("mon-agent-pet-settings", handler)
  },
  onPetBubbleCollapsed(callback) {
    const handler = (_event, collapsed) => callback(Boolean(collapsed))
    ipcRenderer.on("mon-agent-pet-bubble-collapsed", handler)
    return () => ipcRenderer.removeListener("mon-agent-pet-bubble-collapsed", handler)
  },
  onGlobalPetPointer(callback) {
    const handler = (_event, pointer) => callback(pointer)
    ipcRenderer.on("mon-agent-global-pet-pointer", handler)
    return () => ipcRenderer.removeListener("mon-agent-global-pet-pointer", handler)
  },
  onPetIconPlacement(callback) {
    const handler = (_event, placement) => callback(placement)
    ipcRenderer.on("mon-agent-pet-icon-placement", handler)
    return () => ipcRenderer.removeListener("mon-agent-pet-icon-placement", handler)
  },
  onPetCharacterViewport(callback) {
    const handler = (_event, viewport) => callback(viewport)
    ipcRenderer.on("mon-agent-pet-character-viewport", handler)
    return () => ipcRenderer.removeListener("mon-agent-pet-character-viewport", handler)
  },
  onDesktopEnvironment(callback) {
    const handler = (_event, environment) => callback(environment)
    ipcRenderer.on("mon-agent-desktop-environment", handler)
    return () => ipcRenderer.removeListener("mon-agent-desktop-environment", handler)
  },
  onOpenSettings(callback) {
    const handler = () => callback()
    ipcRenderer.on("mon-agent-open-settings", handler)
    return () => ipcRenderer.removeListener("mon-agent-open-settings", handler)
  },
  onAuthState(callback) {
    const handler = (_event, state) => callback(state)
    ipcRenderer.on("mon-agent-auth-state", handler)
    return () => ipcRenderer.removeListener("mon-agent-auth-state", handler)
  },
  onSpeechPlaybackControl(callback) {
    const handler = (_event, control) => callback(control)
    ipcRenderer.on("mon-agent-speech-playback-control", handler)
    return () => ipcRenderer.removeListener("mon-agent-speech-playback-control", handler)
  },
  convertFileSrc,
})
