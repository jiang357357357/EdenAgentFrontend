const { contextBridge, ipcRenderer } = require("electron")
const { desktopFileUrl, resolveBundledWebAssetPath } = require("./protocols/file-protocol.cjs")

function convertFileSrc(filePath) {
  return desktopFileUrl(resolveBundledWebAssetPath(filePath, {
    preloadDirectory: __dirname,
    isPackaged: !process.defaultApp,
  }))
}

contextBridge.exposeInMainWorld("edenAgentDesktop", {
  getAgentCapability() {
    return ipcRenderer.invoke("eden-agent:capability")
  },
  invoke(command, args) {
    return ipcRenderer.invoke("eden-agent:invoke", command, args ?? {})
  },
  onViewMode(callback) {
    const handler = (_event, mode) => callback(mode)
    ipcRenderer.on("eden-agent-view-mode", handler)
    return () => ipcRenderer.removeListener("eden-agent-view-mode", handler)
  },
  onPetSettings(callback) {
    const handler = (_event, settings) => callback(settings)
    ipcRenderer.on("eden-agent-pet-settings", handler)
    return () => ipcRenderer.removeListener("eden-agent-pet-settings", handler)
  },
  onPetBubbleCollapsed(callback) {
    const handler = (_event, collapsed) => callback(Boolean(collapsed))
    ipcRenderer.on("eden-agent-pet-bubble-collapsed", handler)
    return () => ipcRenderer.removeListener("eden-agent-pet-bubble-collapsed", handler)
  },
  onGlobalPetPointer(callback) {
    const handler = (_event, pointer) => callback(pointer)
    ipcRenderer.on("eden-agent-global-pet-pointer", handler)
    return () => ipcRenderer.removeListener("eden-agent-global-pet-pointer", handler)
  },
  onPetIconPlacement(callback) {
    const handler = (_event, placement) => callback(placement)
    ipcRenderer.on("eden-agent-pet-icon-placement", handler)
    return () => ipcRenderer.removeListener("eden-agent-pet-icon-placement", handler)
  },
  onPetCharacterViewport(callback) {
    const handler = (_event, viewport) => callback(viewport)
    ipcRenderer.on("eden-agent-pet-character-viewport", handler)
    return () => ipcRenderer.removeListener("eden-agent-pet-character-viewport", handler)
  },
  onDesktopEnvironment(callback) {
    const handler = (_event, environment) => callback(environment)
    ipcRenderer.on("eden-agent-desktop-environment", handler)
    return () => ipcRenderer.removeListener("eden-agent-desktop-environment", handler)
  },
  onOpenSettings(callback) {
    const handler = () => callback()
    ipcRenderer.on("eden-agent-open-settings", handler)
    return () => ipcRenderer.removeListener("eden-agent-open-settings", handler)
  },
  onAuthState(callback) {
    const handler = (_event, state) => callback(state)
    ipcRenderer.on("eden-agent-auth-state", handler)
    return () => ipcRenderer.removeListener("eden-agent-auth-state", handler)
  },
  onSpeechPlaybackControl(callback) {
    const handler = (_event, control) => callback(control)
    ipcRenderer.on("eden-agent-speech-playback-control", handler)
    return () => ipcRenderer.removeListener("eden-agent-speech-playback-control", handler)
  },
  convertFileSrc,
})
