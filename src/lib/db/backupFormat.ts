/**
 * Formato del archivo .atrium-backup. Sin dependencias de navegador ni de Electron:
 * lo usan tanto el renderer (exportar / importar) como el proceso main (copia automática).
 */
import type { PersistedData } from '@/types'
import { PBKDF2_ITERATIONS } from '@/lib/crypto/types'
import { decryptJson, encryptJson, importAesKeyFromHex, type EncryptedBlob } from '@/lib/crypto/syncCrypto'

export const ATRIUM_BACKUP_MAGIC = 'atrium-backup'
export const ATRIUM_BACKUP_VERSION = 1

/** Nombre fijo del archivo que la copia automática sobrescribe en la carpeta elegida. */
export const FOLDER_BACKUP_FILENAME = 'Atrium - copia automática.atrium-backup'

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

export function parseBackupFile(raw: string): { ok: true; file: AtriumBackupFile } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return { ok: false, error: 'El archivo no es un backup de Atrium válido.' }
  }
  if (!isBackupFile(parsed)) {
    return { ok: false, error: 'El archivo no es un backup cifrado .atrium-backup.' }
  }
  return { ok: true, file: parsed }
}

export async function decryptBackupFile(file: AtriumBackupFile, keyHex: string): Promise<PersistedData> {
  return decryptJson<PersistedData>(file.blob, await importAesKeyFromHex(keyHex))
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
