import fs from 'node:fs'
import path from 'node:path'
import type { PersistedData } from '@/types'
import {
  getCryptoStatus,
  loadLegacyPlainKey,
  migrateLegacyKeyFile,
  setupWithPassword,
  setupWithSecureStorage,
  tryAutoUnlock as tryAutoUnlockKey,
  unlockWithPassword,
} from '@/lib/crypto/keyManagerMain'
import {
  closeDatabase,
  clearEncryptionKey,
  dbFileExists,
  getDatabase,
  getDbPath,
  getUserDataDir,
  hasEncryptionKey,
  isDatabaseOpen,
  openDatabaseWithKey,
  setUserDataDir,
  verifyDatabaseKey,
} from './connection'
import { parseJournalFile } from './import'
import { migrateLegacyJsonIfNeeded } from './migrateFromJson'
import { isDatabaseEmpty, loadJournal, saveJournal } from './repository'
import type { DiskLoad, JournalBackup } from './types'
import { DB_FILENAME } from './schema'

const BACKUP_EVERY_MS = 10 * 60 * 1000
const BACKUP_KEEP = 10
const DATED_DB = /^journal-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/
const DATED_JSON = /^journal-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/
const UNRECOVERABLE_MSG =
  'No se pudo recuperar la clave de cifrado del sistema. Sin la contraseña maestra ni la clave en el almacén seguro del SO, los datos cifrados no son recuperables.'

let lastDatedBackup = 0
let prepared = false

function dbFile() {
  return getDbPath()
}

function backupsDir(userDataDir: string) {
  return path.join(userDataDir, 'backups')
}

function immediateBak() {
  return `${dbFile()}.bak`
}

function insideDir(dir: string, file: string) {
  const root = path.resolve(dir)
  const target = path.resolve(file)
  const prefix = root.toLowerCase()
  const full = target.toLowerCase()
  return full === prefix || full.startsWith(prefix + path.sep.toLowerCase())
}

function pruneDatedBackups(dir: string, keepName?: string) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => (DATED_DB.test(f) || DATED_JSON.test(f)) && f !== keepName)
    .sort()
  while (files.length > BACKUP_KEEP) {
    const old = files.shift()
    if (old) fs.unlinkSync(path.join(dir, old))
  }
}

function archiveCurrent(file: string, userDataDir: string, keepName?: string): boolean {
  if (!fs.existsSync(file)) return false
  try {
    const dir = backupsDir(userDataDir)
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    fs.copyFileSync(file, path.join(dir, `journal-${stamp}.db`))
    pruneDatedBackups(dir, keepName)
    return true
  } catch {
    return false
  }
}

function checkpointWal(): void {
  try {
    getDatabase().pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* ignore */
  }
}

function rotateBackups(userDataDir: string) {
  const file = dbFile()
  if (!fs.existsSync(file)) return
  checkpointWal()
  try {
    fs.copyFileSync(file, immediateBak())
  } catch {
    /* ignore */
  }
  const now = Date.now()
  if (now - lastDatedBackup < BACKUP_EVERY_MS) return
  if (archiveCurrent(file, userDataDir)) lastDatedBackup = now
}

function openWithKey(key: string): boolean {
  try {
    if (!verifyDatabaseKey(key)) return false
    openDatabaseWithKey(key)
    return true
  } catch {
    return false
  }
}

function bootstrapEncryptionKey(userDataDir: string): boolean {
  if (isDatabaseOpen()) return true

  migrateLegacyKeyFile(userDataDir)
  const status = getCryptoStatus(userDataDir, dbFileExists())

  if (status.mode === 'password') return false

  if (status.mode === 'secure-storage') {
    const unlocked = tryAutoUnlockKey(userDataDir)
    if (unlocked.ok && openWithKey(unlocked.key)) return true
  }

  const legacyKey = loadLegacyPlainKey(userDataDir)
  if (legacyKey && openWithKey(legacyKey)) {
    migrateLegacyKeyFile(userDataDir)
    return true
  }

  return false
}

/** Prepara rutas, migra claves legacy y auto-desbloquea con safeStorage si aplica. */
export function prepareJournalDb(userDataDir: string): void {
  if (prepared) return
  setUserDataDir(userDataDir)
  prepared = true

  if (bootstrapEncryptionKey(userDataDir)) {
    migrateLegacyJsonIfNeeded(getDatabase(), userDataDir)
  }
}

export function shutdownJournalDb(): void {
  closeDatabase()
  clearEncryptionKey()
  prepared = false
}

export function isJournalLocked(): boolean {
  const dir = getUserDataDir()
  const status = getCryptoStatus(dir, dbFileExists())
  if (!status.configured) return false
  if (status.mode === 'password' && dbFileExists() && !hasEncryptionKey()) return true
  if (status.mode === 'secure-storage' && status.needsUnlock && dbFileExists()) return false
  return !isDatabaseOpen() && dbFileExists() && status.configured && status.mode === 'password'
}

export function isJournalUnrecoverable(): boolean {
  const dir = getUserDataDir()
  const status = getCryptoStatus(dir, dbFileExists())
  return status.configured && status.mode === 'secure-storage' && status.needsUnlock && dbFileExists()
}

export function journalCryptoStatus() {
  return getCryptoStatus(getUserDataDir(), dbFileExists())
}

export function journalSetupPassword(password: string): { ok: true } | { ok: false; error: string } {
  const dir = getUserDataDir()
  const result = setupWithPassword(dir, password)
  if (!result.ok) return result
  if (!openWithKey(result.key)) {
    return { ok: false, error: 'No se pudo inicializar la base de datos cifrada.' }
  }
  migrateLegacyJsonIfNeeded(getDatabase(), dir)
  return { ok: true }
}

export function journalSetupSecureStorage(): { ok: true } | { ok: false; error: string } {
  const dir = getUserDataDir()
  const result = setupWithSecureStorage(dir)
  if (!result.ok) return result
  if (!openWithKey(result.key)) {
    return { ok: false, error: 'No se pudo inicializar la base de datos cifrada.' }
  }
  migrateLegacyJsonIfNeeded(getDatabase(), dir)
  return { ok: true }
}

export function journalUnlockPassword(password: string): { ok: true } | { ok: false; error: string } {
  const dir = getUserDataDir()
  const derived = unlockWithPassword(dir, password)
  if (!derived.ok) return derived
  if (!openWithKey(derived.key)) {
    return {
      ok: false,
      error: 'Contraseña incorrecta. Sin la contraseña maestra, los datos cifrados no son recuperables.',
    }
  }
  migrateLegacyJsonIfNeeded(getDatabase(), dir)
  return { ok: true }
}

export function journalTryAutoUnlock(): { ok: true } | { ok: false; error: string } {
  const dir = getUserDataDir()
  if (bootstrapEncryptionKey(dir)) {
    migrateLegacyJsonIfNeeded(getDatabase(), dir)
    return { ok: true }
  }
  const result = tryAutoUnlockKey(dir)
  if (!result.ok) return result
  if (!openWithKey(result.key)) {
    return { ok: false, error: UNRECOVERABLE_MSG }
  }
  migrateLegacyJsonIfNeeded(getDatabase(), dir)
  return { ok: true }
}

function looksLikeJournalData(data: PersistedData): boolean {
  return !!data?.settings || !!data?.accounts?.length
}

export function journalLoad(): DiskLoad {
  if (isJournalUnrecoverable()) {
    return { status: 'unrecoverable', message: UNRECOVERABLE_MSG }
  }
  if (isJournalLocked()) return { status: 'locked' }

  if (!isDatabaseOpen()) {
    const dir = getUserDataDir()
    const status = getCryptoStatus(dir, dbFileExists())
    if (!status.configured && !dbFileExists()) return { status: 'empty' }
    if (status.configured && !isDatabaseOpen()) {
      if (status.mode === 'password') return { status: 'locked' }
      if (bootstrapEncryptionKey(dir)) {
        migrateLegacyJsonIfNeeded(getDatabase(), dir)
      } else {
        return { status: 'unrecoverable', message: UNRECOVERABLE_MSG }
      }
    }
  }

  const db = getDatabase()
  if (isDatabaseEmpty(db)) return { status: 'empty' }
  const data = loadJournal(db)
  if (!data) return { status: 'empty' }
  return { status: 'ok', data, skippedTrades: 0, skippedNotes: 0 }
}

export function journalSave(data: PersistedData, userDataDir: string): boolean {
  if (isJournalLocked() || isJournalUnrecoverable() || !looksLikeJournalData(data)) return false
  try {
    if (!isDatabaseOpen()) {
      const status = getCryptoStatus(userDataDir, dbFileExists())
      if (!status.configured) return false
      if (!bootstrapEncryptionKey(userDataDir)) return false
    }
    rotateBackups(userDataDir)
    const db = getDatabase()
    saveJournal(db, data)
    return true
  } catch {
    return false
  }
}

export function journalDataPath(): string {
  return dbFile()
}

export function listJournalBackups(userDataDir: string): JournalBackup[] {
  const items: JournalBackup[] = []
  try {
    const bak = immediateBak()
    if (fs.existsSync(bak)) {
      const st = fs.statSync(bak)
      items.push({ id: 'latest.bak', kind: 'immediate', mtime: st.mtimeMs, bytes: st.size })
    }
    const dir = backupsDir(userDataDir)
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) {
        if (!DATED_DB.test(name) && !DATED_JSON.test(name)) continue
        const p = path.join(dir, name)
        if (!insideDir(dir, p)) continue
        const st = fs.statSync(p)
        items.push({ id: name, kind: 'dated', mtime: st.mtimeMs, bytes: st.size })
      }
    }
  } catch {
    /* ignore */
  }
  return items.sort((a, b) => b.mtime - a.mtime)
}

function resolveBackup(userDataDir: string, id: string): string | null {
  if (id === 'latest.bak') {
    const p = path.resolve(immediateBak())
    return fs.existsSync(p) ? p : null
  }
  if (!DATED_DB.test(id) && !DATED_JSON.test(id)) return null
  const dir = backupsDir(userDataDir)
  const p = path.join(dir, id)
  if (!insideDir(dir, p) || !fs.existsSync(p)) return null
  return p
}

function reunlockAfterRestore(): { ok: true } | { ok: false; error: string } {
  closeDatabase()
  clearEncryptionKey()
  if (bootstrapEncryptionKey(getUserDataDir())) return { ok: true }
  const status = getCryptoStatus(getUserDataDir(), true)
  if (status.mode === 'password') {
    return { ok: false, error: 'Introduce tu contraseña maestra para abrir la copia restaurada.' }
  }
  return { ok: false, error: UNRECOVERABLE_MSG }
}

export function restoreJournalBackup(userDataDir: string, id: string): { ok: true } | { ok: false; error: string } {
  const backupFile = resolveBackup(userDataDir, id)
  if (!backupFile) return { ok: false, error: 'No se encontró esa copia' }
  try {
    const file = dbFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    archiveCurrent(file, userDataDir, id !== 'latest.bak' ? id : undefined)
    if (id !== 'latest.bak' && fs.existsSync(file)) {
      try {
        fs.copyFileSync(file, immediateBak())
      } catch {
        /* ignore */
      }
    }

    if (backupFile.endsWith('.json')) {
      const raw = fs.readFileSync(backupFile, 'utf-8')
      const parsed = parseJournalFile(JSON.parse(raw) as unknown)
      if (!parsed.ok) return { ok: false, error: parsed.error }
      const unlocked = reunlockAfterRestore()
      if (!unlocked.ok) return unlocked
      if (!journalSave(parsed.data, userDataDir)) {
        return { ok: false, error: 'No se pudo importar la copia JSON' }
      }
      return { ok: true }
    }

    fs.copyFileSync(backupFile, file)
    const unlocked = reunlockAfterRestore()
    if (!unlocked.ok) return unlocked
    const db = getDatabase()
    if (isDatabaseEmpty(db)) {
      return { ok: false, error: 'Esa copia no contiene un diario válido' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo restaurar' }
  }
}

export function importJsonBackup(userDataDir: string, raw: unknown): boolean {
  const parsed = parseJournalFile(raw)
  if (!parsed.ok) return false
  return journalSave(parsed.data, userDataDir)
}

export { DB_FILENAME }
