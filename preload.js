const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  timerTick:      (data) => ipcRenderer.send('timer-tick', data),
  addToCalendar:  (data) => ipcRenderer.invoke('add-to-calendar', data),
  toggleCompact:  ()     => ipcRenderer.send('window-compact-toggle'),
  onCompactChanged: (callback) => ipcRenderer.on('window-compact-changed', (_, compact) => callback(compact)),
  closeWindow:    ()     => ipcRenderer.send('window-close'),
  minimizeWindow: ()     => ipcRenderer.send('window-minimize'),
});
