const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('starwork', {
  openTextFile: (options) => ipcRenderer.invoke('starwork:openTextFile', options || {}),
  saveTextFile: (options) => ipcRenderer.invoke('starwork:saveTextFile', options || {}),
  autoBackup: (options) => ipcRenderer.invoke('starwork:autoBackup', options || {}),
  checkForUpdates: () => ipcRenderer.invoke('starwork:checkForUpdates'),
  onUpdateStatus: (cb) => {
    const handler = (_event, payload) => {
      try { cb(payload); } catch {}
    };
    ipcRenderer.on('starwork:updateStatus', handler);
    return () => {
      try { ipcRenderer.removeListener('starwork:updateStatus', handler); } catch {}
    };
  }
});
