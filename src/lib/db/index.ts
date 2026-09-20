/**
 * Punto de entrada del almacenamiento para el renderer.
 *
 * Electron (`window.api`): IPC → SQLite cifrado en el proceso principal
 * (`repository/` + `connection.ts`). El módulo nativo no se empaqueta en web.
 *
 * Navegador: IndexedDB + WebCrypto (`./web`), detrás de la misma fachada
 * `client.ts` que ya consumen `store.ts` y las páginas.
 */
export {
  isDesktop,
  loadData,
  saveData,
  saveDataSync,
  exportFile,
  importFile,
  openDataFolder,
  wipeLocalStorage,
  listBackups,
  restoreBackup,
  getLitestreamStatus,
  chooseLitestreamDestination,
  resetLitestreamDestination,
  restoreLitestreamReplica,
  openLitestreamReplicaFolder,
  parseJournalFile,
  parseJournalText,
} from './client'
export type { DiskLoad, DiskLoadRaw, Filter, JournalBackup, LitestreamStatus, DesktopApi } from './client'
export type { JournalParseOk, JournalParseFail, JournalParseResult } from './client'
