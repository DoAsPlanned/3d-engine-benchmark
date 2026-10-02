const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  getStaticSystemInfo: () => ipcRenderer.invoke('system:static'),
  getLiveSystemMetrics: () => ipcRenderer.invoke('system:metrics'),
});
