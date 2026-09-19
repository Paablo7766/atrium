import { safeStorage } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getEncryptionKeyHex } from '@/lib/db/connection'
import { PBKDF2_ITERATIONS } from './types'
import type { CryptoMeta, CryptoMode, CryptoStatus } from './types'
import { SYNC_HKDF_INFO } from './types'

export { PBKDF2_ITERATIONS } from './types'
export type { CryptoMeta, CryptoMode, CryptoStatus } from './types'

export const CRYPTO_META_FILE = '.crypto-meta.json'
export const SECURE_KEY_FILE = '.db-key.secure'
export const LEGACY_KEY_FILE = '.db-key'

const KEY_BYTES = 32

export function generateSaltHex(): string {
  return crypto.randomBytes(16).toString('hex')
}

export function generateRandomKeyHex(): string {
  return crypto.randomBytes(KEY_BYTES).toString('hex')
}

export function deriveKeyFromPassword(password: string, saltHex: string): string {
  const salt = Buffer.from(saltHex, 'hex')
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_BYTES, 'sha256').toString('hex')
}

/** HKDF-SHA256 — misma derivación que syncCrypto.ts en el renderer. */
export function deriveSyncKeyHexFromDbKey(dbKeyHex: string): string {
  const ikm = Buffer.from(dbKeyHex, 'hex')
  const derived = crypto.hkdfSync('sha256', ikm, Buffer.alloc(0), SYNC_HKDF_INFO, KEY_BYTES)
  return Buffer.from(derived).toString('hex')
}

export function getSyncKeyHex(userDataDir: string): { ok: true; keyHex: string } | { ok: false; error: string } {
  const dbKey = getEncryptionKeyHex()
  if (dbKey) return { ok: true, keyHex: deriveSyncKeyHexFromDbKey(dbKey) }

  const meta = readCryptoMeta(userDataDir)
  if (meta?.mode === 'secure-storage') {
    return { ok: false, error: 'Desbloquea la base de datos local antes de sincronizar.' }
  }
  return { ok: false, error: 'Base de datos bloqueada. Desbloquea con tu contraseña maestra.' }
}

export function deriveSyncKeyHexFromPassword(userDataDir: string, password: string): { ok: true; keyHex: string } | { ok: false; error: string } {
  const meta = readCryptoMeta(userDataDir)
  if (!meta || meta.mode !== 'password' || !meta.salt) {
    return { ok: false, error: 'El cifrado por contraseña no está configurado.' }
  }
  const trimmed = password.trim()
  if (!trimmed) return { ok: false, error: 'Introduce tu contraseña maestra.' }
  const dbKey = deriveKeyFromPassword(trimmed, meta.salt)
  return { ok: true, keyHex: deriveSyncKeyHexFromDbKey(dbKey) }
}

function metaPath(userDataDir: string): string {
  return path.join(userDataDir, CRYPTO_META_FILE)
}

function secureKeyPath(userDataDir: string): string {
  return path.join(userDataDir, SECURE_KEY_FILE)
}

export function readCryptoMeta(userDataDir: string): CryptoMeta | null {
  const p = metaPath(userDataDir)
  if (!fs.existsSync(p)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<CryptoMeta>
    if (raw.mode !== 'password' && raw.mode !== 'secure-storage') return null
    if (raw.kdf !== 'pbkdf2') return null
    if (typeof raw.iterations !== 'number' || raw.iterations < PBKDF2_ITERATIONS) return null
    if (raw.mode === 'password' && (typeof raw.salt !== 'string' || !/^[0-9a-f]+$/i.test(raw.salt))) return null
    return {
      mode: raw.mode,
      salt: raw.salt,
      kdf: 'pbkdf2',
      iterations: raw.iterations,
    }
  } catch {
    return null
  }
}

export function writeCryptoMeta(userDataDir: string, meta: CryptoMeta): void {
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(metaPath(userDataDir), JSON.stringify(meta, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

export function isSecureStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function storeKeyInSecureStorage(userDataDir: string, keyHex: string): boolean {
  if (!isSecureStorageAvailable()) return false
  try {
    const encrypted = safeStorage.encryptString(keyHex)
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.writeFileSync(secureKeyPath(userDataDir), encrypted, { mode: 0o600 })
    return true
  } catch {
    return false
  }
}

export function loadKeyFromSecureStorage(userDataDir: string): string | null {
  if (!isSecureStorageAvailable()) return null
  const p = secureKeyPath(userDataDir)
  if (!fs.existsSync(p)) return null
  try {
    const encrypted = fs.readFileSync(p)
    const key = safeStorage.decryptString(encrypted)
    return key.trim().length >= KEY_BYTES * 2 ? key.trim() : null
  } catch {
    return null
  }
}

export function deleteSecureKeyFile(userDataDir: string): void {
  try {
    const p = secureKeyPath(userDataDir)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  } catch {
    /* ignore */
  }
}

export function loadLegacyPlainKey(userDataDir: string): string | null {
  const legacyPath = path.join(userDataDir, LEGACY_KEY_FILE)
  if (!fs.existsSync(legacyPath)) return null
  try {
    const key = fs.readFileSync(legacyPath, 'utf-8').trim()
    return key.length >= KEY_BYTES * 2 ? key : null
  } catch {
    return null
  }
}

/** Migrate legacy plain `.db-key` into OS secure storage when available. */
export function migrateLegacyKeyFile(userDataDir: string): CryptoMeta | null {
  const existing = readCryptoMeta(userDataDir)
  if (existing) return existing

  const key = loadLegacyPlainKey(userDataDir)
  if (!key) return null

  if (!storeKeyInSecureStorage(userDataDir, key)) {
    return null
  }

  const meta: CryptoMeta = {
    mode: 'secure-storage',
    kdf: 'pbkdf2',
    iterations: PBKDF2_ITERATIONS,
  }
  writeCryptoMeta(userDataDir, meta)

  try {
    fs.renameSync(path.join(userDataDir, LEGACY_KEY_FILE), `${path.join(userDataDir, LEGACY_KEY_FILE)}.migrated`)
  } catch {
    try {
      fs.unlinkSync(path.join(userDataDir, LEGACY_KEY_FILE))
    } catch {
      /* ignore */
    }
  }

  return meta
}

export function getCryptoStatus(userDataDir: string, dbFileExists: boolean): CryptoStatus {
  const secureStorageAvailable = isSecureStorageAvailable()
  const meta = readCryptoMeta(userDataDir) ?? migrateLegacyKeyFile(userDataDir)

  if (!meta) {
    return {
      configured: false,
      mode: null,
      secureStorageAvailable,
      needsUnlock: false,
    }
  }

  if (meta.mode === 'password') {
    return {
      configured: true,
      mode: 'password',
      secureStorageAvailable,
      needsUnlock: dbFileExists,
    }
  }

  return {
    configured: true,
    mode: 'secure-storage',
    secureStorageAvailable,
    needsUnlock: dbFileExists && !loadKeyFromSecureStorage(userDataDir),
  }
}

type KeyResult = { ok: true; key: string } | { ok: false; error: string }

export function setupWithPassword(userDataDir: string, password: string): KeyResult {
  const trimmed = password.trim()
  if (trimmed.length < 8) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' }
  }
  if (readCryptoMeta(userDataDir)) {
    return { ok: false, error: 'El cifrado ya está configurado.' }
  }

  const salt = generateSaltHex()
  const key = deriveKeyFromPassword(trimmed, salt)
  const meta: CryptoMeta = {
    mode: 'password',
    salt,
    kdf: 'pbkdf2',
    iterations: PBKDF2_ITERATIONS,
  }
  writeCryptoMeta(userDataDir, meta)
  deleteSecureKeyFile(userDataDir)
  return { ok: true, key }
}

export function setupWithSecureStorage(userDataDir: string): KeyResult {
  if (!isSecureStorageAvailable()) {
    return {
      ok: false,
      error: 'El almacén seguro del sistema no está disponible en este equipo.',
    }
  }
  if (readCryptoMeta(userDataDir)) {
    return { ok: false, error: 'El cifrado ya está configurado.' }
  }

  const key = generateRandomKeyHex()
  if (!storeKeyInSecureStorage(userDataDir, key)) {
    return { ok: false, error: 'No se pudo guardar la clave en el almacén seguro del sistema.' }
  }

  writeCryptoMeta(userDataDir, {
    mode: 'secure-storage',
    kdf: 'pbkdf2',
    iterations: PBKDF2_ITERATIONS,
  })
  return { ok: true, key }
}

export function unlockWithPassword(userDataDir: string, password: string): KeyResult {
  const meta = readCryptoMeta(userDataDir)
  if (!meta || meta.mode !== 'password' || !meta.salt) {
    return { ok: false, error: 'No hay contraseña maestra configurada.' }
  }
  const trimmed = password.trim()
  if (!trimmed) {
    return { ok: false, error: 'Introduce tu contraseña maestra.' }
  }
  const key = deriveKeyFromPassword(trimmed, meta.salt)
  return { ok: true, key }
}

export function tryAutoUnlock(userDataDir: string): KeyResult {
  const meta = readCryptoMeta(userDataDir)
  if (!meta || meta.mode !== 'secure-storage') {
    return { ok: false, error: 'No hay clave en el almacén seguro del sistema.' }
  }
  const key = loadKeyFromSecureStorage(userDataDir)
  if (!key) {
    return {
      ok: false,
      error:
        'No se pudo recuperar la clave del almacén seguro del sistema. Sin ella, los datos cifrados no son recuperables.',
    }
  }
  return { ok: true, key }
}
