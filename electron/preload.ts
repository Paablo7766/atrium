import { contextBridge, ipcRenderer } from 'electron'



type Filter = { name: string; extensions: string[] }



contextBridge.exposeInMainWorld('api', {

  load: () => ipcRenderer.invoke('data:load'),

  save: (data: unknown) => ipcRenderer.invoke('data:save', data),

  saveSync: (data: unknown) => ipcRenderer.sendSync('data:save-sync', data) as boolean,

  dataPath: () => ipcRenderer.invoke('app:dataPath'),

  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),

  wipeLocal: () => ipcRenderer.invoke('data:wipeLocal'),

  listBackups: () => ipcRenderer.invoke('data:listBackups'),

  restoreBackup: (id: string) => ipcRenderer.invoke('data:restoreBackup', id),

  litestream: {
    getStatus: () => ipcRenderer.invoke('litestream:getStatus'),
    chooseDestination: () => ipcRenderer.invoke('litestream:chooseDestination'),
    resetDestination: () => ipcRenderer.invoke('litestream:resetDestination'),
    restore: () => ipcRenderer.invoke('litestream:restore'),
    openReplicaFolder: () => ipcRenderer.invoke('litestream:openReplicaFolder'),
  },

  exportFile: (content: string, defaultName: string, filters: Filter[]) =>

    ipcRenderer.invoke('file:export', { content, defaultName, filters }),

  importFile: (filters: Filter[]) => ipcRenderer.invoke('file:import', filters),

  platform: process.platform,

  crypto: {

    getStatus: () => ipcRenderer.invoke('crypto:getStatus'),

    setupPassword: (password: string) => ipcRenderer.invoke('crypto:setupPassword', password),

    setupSecureStorage: () => ipcRenderer.invoke('crypto:setupSecureStorage'),

    unlockPassword: (password: string) => ipcRenderer.invoke('crypto:unlockPassword', password),

    tryAutoUnlock: () => ipcRenderer.invoke('crypto:tryAutoUnlock'),

    deriveSyncKey: () => ipcRenderer.invoke('crypto:deriveSyncKey'),

    deriveSyncKeyFromPassword: (password: string) => ipcRenderer.invoke('crypto:deriveSyncKeyFromPassword', password),

    getExportMaterial: () => ipcRenderer.invoke('crypto:getExportMaterial'),

  },

})


