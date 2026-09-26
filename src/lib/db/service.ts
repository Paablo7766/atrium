import fs from 'node:fs'
import path from 'node:path'
import type { PersistedData } from '@/types'
import {
  CRYPTO_META_FILE,
  deleteSecureKeyFile,
  deriveKeyFromPassword,
  generateSaltHex,
  getCryptoStatus,
  loadLegacyPlainKey,
  migrateLegacyKeyFile,
  readCryptoMeta,
  setupWithPassword,
  setupWithSecureStorage,
  tryAutoUnlock as tryAutoUnlockKey,
  unlockWithPassword,
  writeCryptoMeta,
  pinSessionDbKey,
  clearSessionDbKey,
} from '@/lib/crypto/keyManagerMain'
import { PBKDF2_ITERATIONS } from '@/lib/crypto/types'
import {
  closeDatabase,
  clearEncryptionKey,
  dbFileExists,
  getDatabase,
  getDbPath,
  getLastCipherError,
  getUserDataDir,
  hasEncryptionKey,
  isDatabaseOpen,
  openDatabaseWithKey,
  rekeyDatabase,
  setEncryptionKey,
  setUserDataDir,
} from './connection'
import { parseJournalFile } from './import'
import { migrateLegacyJsonIfNeeded } from './migrateFromJson'
import { isDatabaseEmpty, loadJournal, saveJournal } from './repository'
import type { DiskLoad, JournalBackup } from './types'
import { DB_FILENAME } from './schema'

const BACKUP_EVERY_MS = 10 * 60 * 1000
const BACKUP_KEEP = 10
/** Empty SQLCipher shell left by a failed first open — safe to replace when OS key is authoritative. */
const ORPHAN_DB_MAX_BYTES = 8192
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

function removeDbFiles(): void {
  const base = dbFile()
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      const p = suffix ? `${base}${suffix}` : base
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch {
      /* ignore */
    }
  }
}

function initError(): string {
  const detail = getLastCipherError()
  return detail
    ? `No se pudo inicializar la base de datos cifrada. (${detail})`
    : 'No se pudo inicializar la base de datos cifrada.'
}

function logInitError(err: unknown, context: string): void {
  console.error(`[journal-db] ${context}`)
  console.error(err)
  if (err instanceof Error) {
    console.error('[journal-db] message:', err.message)
    console.error('[journal-db] stack:', err.stack)
    const extra = err as Error & { code?: unknown }
    if (extra.code != null) console.error('[journal-db] code:', extra.code)
  }
}

function openWithKey(key: string): boolean {
  const tryOpen = (): boolean => {
    try {
      openDatabaseWithKey(key)
      return true
    } catch (error) {
      logInitError(error, 'openWithKey failed — swallowed previously as generic init error')
      closeDatabase()
      clearEncryptionKey()
      clearSessionDbKey()
      return false
    }
  }

  if (tryOpen()) {
    pinSessionDbKey(key)
    return true
  }

  if (!fs.existsSync(dbFile())) return false

  try {
    const size = fs.statSync(dbFile()).size
    const status = getCryptoStatus(getUserDataDir(), true)
    if (status.mode === 'secure-storage' && size <= ORPHAN_DB_MAX_BYTES) {
      removeDbFiles()
      if (tryOpen()) {
        pinSessionDbKey(key)
        return true
      }
    }
  } catch {
    /* ignore */
  }

  return false
}

function bootstrapEncryptionKey(userDataDir: string): boolean {
  if (isDatabaseOpen()) {
    if (hasEncryptionKey()) return true
    closeDatabase()
    return false
  }

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
  clearSessionDbKey()
  prepared = false
}

/** Borra BD local y metadatos de cifrado para «Empezar de cero» (conserva journal-data.json legacy). */
export function journalWipeLocalStorage(userDataDir: string): void {
  shutdownJournalDb()
  removeDbFiles()
  try {
    const meta = path.join(userDataDir, CRYPTO_META_FILE)
    if (fs.existsSync(meta)) fs.unlinkSync(meta)
  } catch {
    /* ignore */
  }
  deleteSecureKeyFile(userDataDir)
  setUserDataDir(userDataDir)
  prepared = true
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
  const status = getCryptoStatus(getUserDataDir(), dbFileExists())
  if (status.mode === 'password' && hasEncryptionKey()) {
    return { ...status, needsUnlock: false }
  }
  return status
}

export function journalSetupPassword(password: string): { ok: true } | { ok: false; error: string } {
  const dir = getUserDataDir()
  const existing = readCryptoMeta(dir)
  if (existing?.mode === 'password') {
    if (isDatabaseOpen()) return { ok: true }
    return journalUnlockPassword(password)
  }
  if (existing) {
    return { ok: false, error: 'El cifrado ya está configurado.' }
  }

  const result = setupWithPassword(dir, password)
  if (!result.ok) return result
  if (!openWithKey(result.key)) {
    removeDbFiles()
    if (!openWithKey(result.key)) return { ok: false, error: initError() }
  }
  migrateLegacyJsonIfNeeded(getDatabase(), dir)
  return { ok: true }
}

export function journalSetupSecureStorage(): { ok: true } | { ok: false; error: string } {
  const dir = getUserDataDir()
  const existing = readCryptoMeta(dir)

  if (existing) {
    if (existing.mode !== 'secure-storage') {
      return { ok: false, error: 'El cifrado ya está configurado con contraseña maestra.' }
    }
    if (isDatabaseOpen()) return { ok: true }
    const unlocked = tryAutoUnlockKey(dir)
    if (!unlocked.ok) return unlocked
    if (openWithKey(unlocked.key)) {
      migrateLegacyJsonIfNeeded(getDatabase(), dir)
      return { ok: true }
    }
    removeDbFiles()
    if (openWithKey(unlocked.key)) {
      migrateLegacyJsonIfNeeded(getDatabase(), dir)
      return { ok: true }
    }
    return { ok: false, error: initError() }
  }

  const result = setupWithSecureStorage(dir)
  if (!result.ok) return result
  if (!openWithKey(result.key)) {
    removeDbFiles()
    if (!openWithKey(result.key)) return { ok: false, error: initError() }
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

/** Pasa de clave automática del sistema a contraseña maestra (copia automática y restauración en móvil). */
export function journalMigrateToMasterPassword(password: string): { ok: true } | { ok: false; error: string } {
  const dir = getUserDataDir()
  const meta = readCryptoMeta(dir)
  if (!meta) return { ok: false, error: 'El cifrado local no está configurado.' }
  if (meta.mode === 'password') {
    return { ok: false, error: 'Tu diario ya usa contraseña maestra.' }
  }
  if (meta.mode !== 'secure-storage') {
    return { ok: false, error: 'No se puede cambiar el modo de cifrado.' }
  }

  const trimmed = password.trim()
  if (trimmed.length < 8) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' }
  }

  if (!hasEncryptionKey()) {
    const unlocked = journalTryAutoUnlock()
    if (!unlocked.ok) return unlocked
  }

  try {
    if (!isDatabaseOpen()) getDatabase()
  } catch {
    return { ok: false, error: initError() }
  }

  const salt = generateSaltHex()
  const newKey = deriveKeyFromPassword(trimmed, salt)
  try {
    rekeyDatabase(newKey)
  } catch (err) {
    console.error('[journalMigrateToMasterPassword] rekey failed', err)
    return { ok: false, error: 'No se pudo actualizar el cifrado del diario.' }
  }

  writeCryptoMeta(dir, {
    mode: 'password',
    salt,
    kdf: 'pbkdf2',
    iterations: PBKDF2_ITERATIONS,
  })
  deleteSecureKeyFile(dir)
  setEncryptionKey(newKey)
  pinSessionDbKey(newKey)
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
  clearSessionDbKey()
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

