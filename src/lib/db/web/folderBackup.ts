/**
 * Copia automática en carpeta (web / Vercel) vía File System Access API.
 * Misma idea que electron/folderBackup.ts: debounce 30 s, archivo .atrium-backup cifrado.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { getWebCryptoMeta } from '@/lib/crypto/keyManagerWeb'
import { FOLDER_BACKUP_UI_ENABLED } from '@/lib/featureFlags'
import {
  ATRIUM_SYNC_FOLDER_NAME,
  FOLDER_BACKUP_FILENAME,
  FOLDER_BACKUP_TMP_FILENAME,
} from '@/lib/db/backupFormat'
import type { FolderBackupStatus } from '@/lib/db/types'
import { exportEncryptedBackup } from './backup'

const FOLDER_BACKUP_IDB = 'atrium-folder-backup'
const FOLDER_BACKUP_IDB_VERSION = 1
const HANDLE_KEY = 'directoryHandle'
const META_KEY = 'meta'

/** Como mucho una escritura cada 30 s mientras haya cambios. */
const SAVE_DELAY_MS = 30_000

type StoredMeta = {
  enabled?: boolean
  folderName?: string
}

interface FolderBackupDB extends DBSchema {
  kv: {
    key: string
    value: FileSystemDirectoryHandle | StoredMeta
  }
}

let dbPromise: Promise<IDBPDatabase<FolderBackupDB>> | null = null
let directoryHandle: FileSystemDirectoryHandle | null = null
let meta: StoredMeta = {}
let timer: ReturnType<typeof setTimeout> | null = null
let queue: Promise<void> = Promise.resolve()
let failed = false
let pendingDir: FileSystemDirectoryHandle | null = null
let bootstrapped = false

export type FolderBackupResult = { ok: true } | { ok: false; error: string }

export function isWebFolderBackupSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

function featureActive(): boolean {
  return FOLDER_BACKUP_UI_ENABLED && isWebFolderBackupSupported()
}

function effectiveEnabled(): boolean {
  return featureActive() && !!meta.enabled && !!directoryHandle
}

function hasMasterPassword(): boolean {
  return getWebCryptoMeta()?.mode === 'password'
}

async function openFolderBackupDb(): Promise<IDBPDatabase<FolderBackupDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FolderBackupDB>(FOLDER_BACKUP_IDB, FOLDER_BACKUP_IDB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
      },
    })
  }
  return dbPromise
}

async function persistHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  const db = await openFolderBackupDb()
  if (handle) await db.put('kv', handle, HANDLE_KEY)
  else await db.delete('kv', HANDLE_KEY)
}

async function persistMeta(next: StoredMeta): Promise<void> {
  meta = next
  const db = await openFolderBackupDb()
  await db.put('kv', next, META_KEY)
}

async function loadPersistedState(): Promise<void> {
  const db = await openFolderBackupDb()
  const storedMeta = await db.get('kv', META_KEY)
  if (storedMeta && typeof storedMeta === 'object' && !('kind' in storedMeta)) {
    meta = storedMeta as StoredMeta
  }
  const handle = await db.get('kv', HANDLE_KEY)
  if (handle && typeof handle === 'object' && 'kind' in handle && handle.kind === 'directory') {
    directoryHandle = handle as FileSystemDirectoryHandle
  }
}

export async function bootstrapWebFolderBackup(): Promise<void> {
  if (bootstrapped || !isWebFolderBackupSupported()) return
  bootstrapped = true
  await loadPersistedState()
}

async function queryDirPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  try {
    return await handle.queryPermission({ mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}

export async function requestWebFolderBackupPermission(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!directoryHandle) return { ok: false, error: 'No hay carpeta guardada.' }
  try {
    const state = await directoryHandle.requestPermission({ mode: 'readwrite' })
    if (state !== 'granted') return { ok: false, error: 'Permiso denegado para acceder a la carpeta.' }
    failed = false
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo reconectar la carpeta.' }
  }
}

async function backupMtime(dir: FileSystemDirectoryHandle): Promise<number | null> {
  try {
    const fileHandle = await dir.getFileHandle(FOLDER_BACKUP_FILENAME)
    const file = await fileHandle.getFile()
    return file.lastModified
  } catch {
    return null
  }
}

async function backupFileExists(dir: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await dir.getFileHandle(FOLDER_BACKUP_FILENAME)
    return true
  } catch {
    return false
  }
}

async function removeTmpIfExists(dir: FileSystemDirectoryHandle): Promise<void> {
  try {
    await dir.removeEntry(FOLDER_BACKUP_TMP_FILENAME)
  } catch {
    /* ignore */
  }
}

/**
 * Escribe el temporal completo y sustituye el backup final con move().
 * Si move falla, no toca el .atrium-backup existente.
 */
export async function writeWebFolderBackupAtomic(
  dir: FileSystemDirectoryHandle,
  raw: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await removeTmpIfExists(dir)
  let tmpHandle: FileSystemFileHandle
  try {
    tmpHandle = await dir.getFileHandle(FOLDER_BACKUP_TMP_FILENAME, { create: true })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo crear el archivo temporal.' }
  }

  try {
    const writable = await tmpHandle.createWritable()
    await writable.write(raw)
    await writable.close()
  } catch (e) {
    await removeTmpIfExists(dir)
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo escribir el temporal.' }
  }

  try {
    await tmpHandle.move(FOLDER_BACKUP_FILENAME)
    return { ok: true }
  } catch (e) {
    await removeTmpIfExists(dir)
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo sustituir la copia de seguridad.' }
  }
}

async function writeBackupNow(): Promise<void> {
  if (!effectiveEnabled() || !directoryHandle) return
  if (!hasMasterPassword()) return

  const perm = await queryDirPermission(directoryHandle)
  if (perm !== 'granted') return

  try {
    const raw = await exportEncryptedBackup()
    const result = await writeWebFolderBackupAtomic(directoryHandle, raw)
    if (!result.ok) {
      failed = true
      console.error('[webFolderBackup] write failed:', result.error)
      return
    }
    failed = false
  } catch (e) {
    failed = true
    console.error('[webFolderBackup] write failed:', e instanceof Error ? e.message : e)
  }
}

function runBackup(): Promise<void> {
  queue = queue.then(writeBackupNow, writeBackupNow)
  return queue
}

export function scheduleWebFolderBackup(): void {
  if (!effectiveEnabled() || timer) return
  timer = setTimeout(() => {
    timer = null
    void runBackup()
  }, SAVE_DELAY_MS)
}

export async function flushWebFolderBackup(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (effectiveEnabled() && hasMasterPassword()) {
    await runBackup()
  }
  await queue
}

export async function getWebFolderBackupStatus(): Promise<FolderBackupStatus> {
  await bootstrapWebFolderBackup()
  const enabled = effectiveEnabled()
  const folderPath = meta.folderName?.trim() || directoryHandle?.name || null
  let needsFolderPermission = false
  if (enabled && directoryHandle) {
    needsFolderPermission = (await queryDirPermission(directoryHandle)) !== 'granted'
  }
  return {
    enabled,
    folderPath,
    lastBackupAt: enabled && directoryHandle ? await backupMtime(directoryHandle) : null,
    failed: enabled ? failed : false,
    needsPassword: !hasMasterPassword(),
    needsFolderPermission,
  }
}

export async function setWebFolderBackupEnabled(enabled: boolean): Promise<FolderBackupResult> {
  if (!featureActive()) {
    return { ok: false, error: 'La copia automática en carpeta no está disponible en esta versión.' }
  }
  if (enabled && !hasMasterPassword()) {
    return { ok: false, error: 'Para poder restaurar la copia en otro dispositivo necesitas una contraseña maestra.' }
  }
  try {
    await persistMeta({ ...meta, enabled })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar la preferencia.' }
  }
  if (!enabled && timer) {
    clearTimeout(timer)
    timer = null
  }
  if (enabled && directoryHandle) await runBackup()
  return { ok: true }
}

async function resolveAtriumDirectory(
  picked: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  const base = picked.name
  const known =
    base.localeCompare(ATRIUM_SYNC_FOLDER_NAME, undefined, { sensitivity: 'accent' }) === 0 ||
    base.toLowerCase() === 'atrium backup'
  if (known || (await backupFileExists(picked))) return picked
  return picked.getDirectoryHandle(ATRIUM_SYNC_FOLDER_NAME, { create: true })
}

async function applyDirectory(dir: FileSystemDirectoryHandle): Promise<FolderBackupResult> {
  try {
    directoryHandle = dir
    await persistHandle(dir)
    await persistMeta({ enabled: true, folderName: dir.name })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar la carpeta.' }
  }
  failed = false
  await runBackup()
  return { ok: true }
}

export async function chooseWebFolderBackupFolder(): Promise<
  { ok: true; needsConfirm: boolean } | { ok: false; error: string }
> {
  if (!featureActive()) {
    return { ok: false, error: 'La copia automática en carpeta no está disponible en esta versión.' }
  }
  if (!hasMasterPassword()) {
    return { ok: false, error: 'Para poder restaurar la copia en otro dispositivo necesitas una contraseña maestra.' }
  }
  let picked: FileSystemDirectoryHandle
  try {
    picked = await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: 'cancelled' }
    }
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo abrir el selector de carpeta.' }
  }

  const resolved = await resolveAtriumDirectory(picked)
  const currentName = directoryHandle?.name ?? null
  if (resolved.name !== currentName && (await backupFileExists(resolved))) {
    pendingDir = resolved
    return { ok: true, needsConfirm: true }
  }
  pendingDir = null
  const result = await applyDirectory(resolved)
  return result.ok ? { ok: true, needsConfirm: false } : result
}

export async function confirmWebFolderBackupFolder(): Promise<FolderBackupResult> {
  if (!featureActive()) {
    return { ok: false, error: 'La copia automática en carpeta no está disponible en esta versión.' }
  }
  const dir = pendingDir
  pendingDir = null
  if (!dir) return { ok: false, error: 'No hay ninguna carpeta pendiente de confirmar.' }
  return applyDirectory(dir)
}

/** Solo tests: estado en memoria sin pasar por IndexedDB. */
export function _setWebFolderBackupStateForTests(dir: FileSystemDirectoryHandle, enabled: boolean): void {
  directoryHandle = dir
  meta = { enabled, folderName: dir.name }
  bootstrapped = true
  failed = false
}

/** Solo tests: recarga handle y meta desde IndexedDB sin borrar la base. */
export async function _reloadWebFolderBackupFromStorageForTests(): Promise<void> {
  directoryHandle = null
  meta = {}
  bootstrapped = false
  await bootstrapWebFolderBackup()
}

/** Solo tests: reinicia estado en memoria. */
export async function _resetWebFolderBackupForTests(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  directoryHandle = null
  meta = {}
  failed = false
  pendingDir = null
  bootstrapped = false
  queue = Promise.resolve()
  dbPromise = null
  if (typeof indexedDB !== 'undefined') {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(FOLDER_BACKUP_IDB)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}
