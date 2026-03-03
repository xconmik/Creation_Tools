const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qaApp', {
  getInitialConfig: () => ipcRenderer.invoke('qa:get-initial-config'),
  saveConfig: (config) => ipcRenderer.invoke('qa:save-config', config),
  runTests: (config) => ipcRenderer.invoke('qa:run-tests', config),
  getCountryProxies: (countryCode) => ipcRenderer.invoke('qa:get-country-proxies', countryCode),
  openResultsFolder: () => ipcRenderer.invoke('qa:open-results-folder'),
  onLog: (handler) => ipcRenderer.on('qa:log', (_event, message) => handler(message)),
  onProgress: (handler) => ipcRenderer.on('qa:progress', (_event, progress) => handler(progress))
});
