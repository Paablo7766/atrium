import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { journalLoad } from '@/lib/db/service'
import { getExportKeyMaterial, readCryptoMeta } from '@/lib/crypto/keyManagerMain'
import { buildEncryptedBackupFile, FOLDER_BACKUP_FILENAME } from '@/lib/db/backupFormat'
import type { FolderBackupStatus } from '@/lib/db/types'

/**
 * Copia automática: escribe un .atrium-backup cifrado en una carpeta elegida por el usuario
 * (normalmente sincronizada por Drive / Dropbox / OneDrive / iCloud). Atrium no habla con
 * ningún servicio de nube; el cliente de sincronización del sistema sube el archivo.
 */

/** Carpeta que creamos dentro de la ubicación elegida (Drive, OneDrive, etc.). */
export const ATRIUM_SYNC_FOLDER_NAME = 'Atrium'

/** Preferencia de este equipo; no va dentro del diario para que no viaje al restaurar en otro. */
const SETTINGS_FILE = '.folder-backup.json'
/** Como mucho una escritura cada 30 s mientras haya cambios. */
const SAVE_DELAY_MS = 30_000

type FolderBackupSettings = {
  enabled?: boolean
  folderPath?: string
}

export type FolderBackupResult = { ok: true } | { ok: false; error: string }

let userDataDir = ''
let settings: FolderBackupSettings = {}
let timer: NodeJS.Timeout | null = null
let queue: Promise<void> = Promise.resolve()
let failed = false
let pendingFolder: string | null = null

function settingsPath(): string {
  return path.join(userDataDir, SETTINGS_FILE)
}

function readSettings(): FolderBackupSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')) as FolderBackupSettings
  } catch {
    return {}
  }
}

function writeSettings(next: FolderBackupSettings): void {
  settings = next
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

/** Sin contraseña maestra la clave es aleatoria y solo existe en este equipo: la copia no se podría abrir en otro. */
function hasMasterPassword(): boolean {
  return readCryptoMeta(userDataDir)?.mode === 'password'
}

function backupFile(folder: string): string {
  return path.join(folder, FOLDER_BACKUP_FILENAME)
}

function backupMtime(folder: string): number | null {
  try {
    return fs.statSync(backupFile(folder)).mtimeMs
  } catch {
    return null
  }
}

async function writeBackupNow(): Promise<void> {
  const folder = settings.folderPath
  if (!settings.enabled || !folder || !hasMasterPassword()) return
  const material = getExportKeyMaterial(userDataDir)
  if (!material.ok) return
  const loaded = journalLoad()
  if (loaded.status !== 'ok') return

  const target = backupFile(folder)
  const tmp = `${target}.tmp`
  try {
    const raw = await buildEncryptedBackupFile(loaded.data, material.keyHex, material.salt, material.iterations)
    // Se escribe en un temporal y se renombra para que el cliente de sync nunca suba un archivo a medias.
    await fs.promises.writeFile(tmp, raw, 'utf-8')
    try {
      await fs.promises.rename(tmp, target)
    } catch {
      // Algunos clientes de sync bloquean el archivo un instante y el renombrado falla en Windows.
      await fs.promises.writeFile(target, raw, 'utf-8')
      await fs.promises.rm(tmp, { force: true })
    }
    failed = false
  } catch (e) {
    failed = true
    console.error('[folderBackup] write failed:', e instanceof Error ? e.message : e)
  }
}

function runBackup(): Promise<void> {
  queue = queue.then(writeBackupNow, writeBackupNow)
  return queue
}

export function initFolderBackup(dataDir: string): void {
  userDataDir = dataDir
  settings = readSettings()
}

/** Se llama tras cada guardado del diario. */
export function scheduleFolderBackup(): void {
  if (!settings.enabled || !settings.folderPath || timer) return
  timer = setTimeout(() => {
    timer = null
    void runBackup()
  }, SAVE_DELAY_MS)
}

/** Al cerrar la app: vuelca la copia pendiente si la copia automática está activa. */
export async function flushFolderBackup(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (settings.enabled && settings.folderPath && hasMasterPassword()) {
    return runBackup()
  }
  return queue
}

export function getFolderBackupStatus(): FolderBackupStatus {
  const folderPath = settings.folderPath?.trim() || null
  return {
    enabled: !!settings.enabled,
    folderPath,
    lastBackupAt: folderPath ? backupMtime(folderPath) : null,
    failed,
    needsPassword: !hasMasterPassword(),
  }
}

export async function setFolderBackupEnabled(enabled: boolean): Promise<FolderBackupResult> {
  if (enabled && !hasMasterPassword()) {
    return { ok: false, error: 'Para poder restaurar la copia en otro dispositivo necesitas una contraseña maestra.' }
  }
  try {
    writeSettings({ ...settings, enabled })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar la preferencia.' }
  }
  if (!enabled && timer) {
    clearTimeout(timer)
    timer = null
  }
  if (enabled && settings.folderPath) await runBackup()
  return { ok: true }
}

/** Si eliges «Mi unidad», creamos automáticamente …/Atrium (no hace falta crear la carpeta a mano). */
export function resolveAtriumBackupFolder(chosenPath: string): string {
  const resolved = path.resolve(chosenPath)
  const base = path.basename(resolved)
  if (fs.existsSync(backupFile(resolved))) return resolved
  const known =
    base.localeCompare(ATRIUM_SYNC_FOLDER_NAME, undefined, { sensitivity: 'accent' }) === 0 ||
    base.toLowerCase() === 'atrium backup'
  const target = known ? resolved : path.join(resolved, ATRIUM_SYNC_FOLDER_NAME)
  fs.mkdirSync(target, { recursive: true })
  return target
}

/** Ruta sugerida al abrir el diálogo (Google Drive en Windows si está montado). */
export function suggestedBackupDialogPath(): string {
  const home = os.homedir()
  const candidates = [
    path.join('G:\\', 'Mi unidad', ATRIUM_SYNC_FOLDER_NAME),
    path.join('G:\\', 'My Drive', ATRIUM_SYNC_FOLDER_NAME),
    path.join(home, 'Google Drive', ATRIUM_SYNC_FOLDER_NAME),
    path.join(home, 'Google Drive', 'Mi unidad', ATRIUM_SYNC_FOLDER_NAME),
    path.join(home, 'OneDrive', ATRIUM_SYNC_FOLDER_NAME),
    path.join(home, 'Documents', ATRIUM_SYNC_FOLDER_NAME),
  ]
  for (const c of candidates) {
    if (fs.existsSync(path.dirname(c))) return c
  }
  return path.join(home, 'Documents', ATRIUM_SYNC_FOLDER_NAME)
}

async function applyFolder(folder: string): Promise<FolderBackupResult> {
  try {
    writeSettings({ enabled: true, folderPath: folder })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar la carpeta.' }
  }
  failed = false
  await runBackup()
  return { ok: true }
}

/**
 * Tras elegir carpeta en el diálogo nativo. Si ya contiene una copia de Atrium (p. ej. de otro
 * dispositivo) no se sobrescribe hasta que el usuario lo confirme con confirmPendingFolder().
 */
export async function chooseFolderBackupDestination(
  folder: string,
): Promise<{ ok: true; needsConfirm: boolean } | { ok: false; error: string }> {
  if (!hasMasterPassword()) {
    return { ok: false, error: 'Para poder restaurar la copia en otro dispositivo necesitas una contraseña maestra.' }
  }
  const resolved = resolveAtriumBackupFolder(folder)
  const current = settings.folderPath ? path.resolve(settings.folderPath) : null
  if (resolved !== current && fs.existsSync(backupFile(resolved))) {
    pendingFolder = resolved
    return { ok: true, needsConfirm: true }
  }
  pendingFolder = null
  const result = await applyFolder(resolved)
  return result.ok ? { ok: true, needsConfirm: false } : result
}

export async function confirmPendingFolder(): Promise<FolderBackupResult> {
  const folder = pendingFolder
  pendingFolder = null
  if (!folder) return { ok: false, error: 'No hay ninguna carpeta pendiente de confirmar.' }
  return applyFolder(folder)
}
