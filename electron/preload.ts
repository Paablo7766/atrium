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

  folderBackup: {
    getStatus: () => ipcRenderer.invoke('folderBackup:getStatus'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('folderBackup:setEnabled', enabled),
    chooseFolder: () => ipcRenderer.invoke('folderBackup:chooseFolder'),
    confirmFolder: () => ipcRenderer.invoke('folderBackup:confirmFolder'),
  },

  exportFile: (content: string, defaultName: string, filters: Filter[]) =>

    ipcRenderer.invoke('file:export', { content, defaultName, filters }),

  importFile: (filters: Filter[]) => ipcRenderer.invoke('file:import', filters),

  platform: process.platform,

  crypto: {

    getStatus: () => ipcRenderer.invoke('crypto:getStatus'),

    setupPassword: (password: string) => ipcRenderer.invoke('crypto:setupPassword', password),
    migrateToMasterPassword: (password: string) => ipcRenderer.invoke('crypto:migrateToMasterPassword', password),

    setupSecureStorage: () => ipcRenderer.invoke('crypto:setupSecureStorage'),

    unlockPassword: (password: string) => ipcRenderer.invoke('crypto:unlockPassword', password),

    tryAutoUnlock: () => ipcRenderer.invoke('crypto:tryAutoUnlock'),

    deriveSyncKey: () => ipcRenderer.invoke('crypto:deriveSyncKey'),

    deriveSyncKeyFromPassword: (password: string) => ipcRenderer.invoke('crypto:deriveSyncKeyFromPassword', password),

    exportEncryptedBackup: (data?: unknown, password?: string) =>
      ipcRenderer.invoke('crypto:exportEncryptedBackup', data, password),

    importEncryptedBackup: (raw: string, password?: string) =>
      ipcRenderer.invoke('crypto:importEncryptedBackup', raw, password),

  },

  updater: {
    getStatus: () => ipcRenderer.invoke('updater:getStatus'),
    setAllowPrerelease: (enabled: boolean) => ipcRenderer.invoke('updater:setAllowPrerelease', enabled),
    download: () => ipcRenderer.invoke('updater:download'),
    installAndRestart: () => ipcRenderer.invoke('updater:installAndRestart'),
    dismiss: () => ipcRenderer.invoke('updater:dismiss'),
    onStatus: (cb: (status: unknown) => void) => {
      const listener = (_event: unknown, status: unknown) => cb(status)
      ipcRenderer.on('updater:status', listener)
      return () => {
        ipcRenderer.removeListener('updater:status', listener)
      }
    },
  },

})


