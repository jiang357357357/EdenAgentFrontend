const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('edenDesktopControl', {
  command: action => ipcRenderer.invoke('eden-desktop-control:command', action),
  onState(callback) {
    const handler = (_event, state) => callback(state)
    ipcRenderer.on('eden-desktop-control:state', handler)
    return () => ipcRenderer.removeListener('eden-desktop-control:state', handler)
  },
})
