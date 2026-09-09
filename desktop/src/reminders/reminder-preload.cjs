const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('reminder', {
  close: () => ipcRenderer.send('eden-reminder:close'),
  onContent: callback => ipcRenderer.on('eden-reminder:content', (_event, value) => callback(value)),
  onError: callback => ipcRenderer.on('eden-reminder:error', (_event, value) => callback(value)),
})
