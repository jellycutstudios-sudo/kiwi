const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isDesktop: true,
  platform: process.platform,
  getPrinters: () => ipcRenderer.invoke('pos:get-printers'),
  printSilent: (options) => ipcRenderer.invoke('pos:print-silent', options),
  toggleKiosk: (enable) => ipcRenderer.invoke('pos:toggle-kiosk', enable),
});

