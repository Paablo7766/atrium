import type { PersistedData } from '@/types'
import { PBKDF2_ITERATIONS } from '@/lib/crypto/types'
import {
  deriveKeyFromPassword,
  getWebCryptoMeta,
  getWebKeyHex,
  setWebKeyHex,
  WEB_CRYPTO_META_KEY,
} from '@/lib/crypto/keyManagerWeb'
import { encryptJson, decryptJson, importAesKeyFromHex, type EncryptedBlob } from '@/lib/crypto/syncCrypto'
import { loadJournal, saveJournal } from './repository'
import { writeCanary } from './canary'

export const ATRIUM_BACKUP_MAGIC = 'atrium-backup'
export const ATRIUM_BACKUP_VERSION = 1

export type AtriumBackupFile = {
  magic: typeof ATRIUM_BACKUP_MAGIC
  version: typeof ATRIUM_BACKUP_VERSION
  kdf: 'pbkdf2'
  iterations: number
  salt: string
  blob: EncryptedBlob
}

function isBackupFile(value: unknown): value is AtriumBackupFile {
  if (!value || typeof value !== 'object') return false
  const v = value as AtriumBackupFile
  return (
    v.magic === ATRIUM_BACKUP_MAGIC &&
    v.version === ATRIUM_BACKUP_VERSION &&
    v.kdf === 'pbkdf2' &&
    typeof v.iterations === 'number' &&
    typeof v.salt === 'string' &&
    !!v.blob &&
    typeof v.blob.ciphertext === 'string' &&
    typeof v.blob.nonce === 'string'
  )
}

export async function buildEncryptedBackupFile(
  data: PersistedData,
  keyHex: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  const blob = await encryptJson(data, await importAesKeyFromHex(keyHex))
  const file: AtriumBackupFile = {
    magic: ATRIUM_BACKUP_MAGIC,
    version: ATRIUM_BACKUP_VERSION,
    kdf: 'pbkdf2',
    iterations: iterations >= PBKDF2_ITERATIONS ? iterations : PBKDF2_ITERATIONS,
    salt,
    blob,
  }
  return JSON.stringify(file)
}

export async function exportEncryptedBackup(data?: PersistedData): Promise<string> {
  const keyHex = getWebKeyHex()
  const meta = getWebCryptoMeta()
  if (!keyHex || !meta?.salt) {
    throw new Error('Desbloquea el diario con tu contraseña maestra para exportar una copia cifrada.')
  }
  const journal = data ?? (await loadJournal())
  if (!journal) throw new Error('No hay un diario que exportar.')
  return buildEncryptedBackupFile(journal, keyHex, meta.salt, meta.iterations || PBKDF2_ITERATIONS)
}

export async function importEncryptedBackup(
  raw: string,
  password?: string,
): Promise<{ ok: true; data: PersistedData } | { ok: false; error: string }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return { ok: false, error: 'El archivo no es un backup de Atrium válido.' }
  }
  if (!isBackupFile(parsed)) {
    return { ok: false, error: 'El archivo no es un backup cifrado .atrium-backup.' }
  }

  const trimmed = password?.trim() ?? ''
  let keyHex = getWebKeyHex()
  const meta = getWebCryptoMeta()

  try {
    if (trimmed) {
      keyHex = await deriveKeyFromPassword(trimmed, parsed.salt)
    } else if (!keyHex) {
      return { ok: false, error: 'Introduce tu contraseña maestra para restaurar la copia.' }
    } else if (meta?.salt && meta.salt !== parsed.salt) {
      return { ok: false, error: 'Esta copia usa otra sal. Introduce la contraseña maestra con la que se exportó.' }
    }
    if (!keyHex) return { ok: false, error: 'Introduce tu contraseña maestra para restaurar la copia.' }

    const data = await decryptJson<PersistedData>(parsed.blob, await importAesKeyFromHex(keyHex))
    if (trimmed) {
      setWebKeyHex(keyHex)
      try {
        localStorage.setItem(
          WEB_CRYPTO_META_KEY,
          JSON.stringify({
            mode: 'password',
            salt: parsed.salt,
            kdf: 'pbkdf2',
            iterations: parsed.iterations >= PBKDF2_ITERATIONS ? parsed.iterations : PBKDF2_ITERATIONS,
          }),
        )
      } catch {
        /* ignore */
      }
      await writeCanary(keyHex)
    }
    await saveJournal(data)
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'No se pudo descifrar la copia. Comprueba la contraseña.' }
  }
}
