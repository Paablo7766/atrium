import { contextBridge, ipcRenderer } from 'electron'

type Filter = { name: string; extensions: string[] }

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data: unknown) => ipcRenderer.invoke('data:save', data),
  saveSync: (data: unknown) => ipcRenderer.sendSync('data:save-sync', data) as boolean,
  dataPath: () => ipcRenderer.invoke('app:dataPath'),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  listBackups: () => ipcRenderer.invoke('data:listBackups'),
  restoreBackup: (id: string) => ipcRenderer.invoke('data:restoreBackup', id),
  exportFile: (content: string, defaultName: string, filters: Filter[]) =>
    ipcRenderer.invoke('file:export', { content, defaultName, filters }),
  importFile: (filters: Filter[]) => ipcRenderer.invoke('file:import', filters),
  platform: process.platform,
})
