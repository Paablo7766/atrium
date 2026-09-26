import type { PersistedData } from '@/types'
import { PBKDF2_ITERATIONS } from '@/lib/crypto/types'
import {
  deriveKeyFromPassword,
  getWebCryptoMeta,
  getWebKeyHex,
  setWebKeyHex,
  WEB_CRYPTO_META_KEY,
} from '@/lib/crypto/keyManagerWeb'
import { buildEncryptedBackupFile, decryptBackupFile, parseBackupFile } from '../backupFormat'
import { loadJournal, saveJournal } from './repository'
import { writeCanary } from './canary'

export {
  ATRIUM_BACKUP_MAGIC,
  ATRIUM_BACKUP_VERSION,
  buildEncryptedBackupFile,
  type AtriumBackupFile,
} from '../backupFormat'

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
): Promise<{ ok: true; data: PersistedData } | { ok: false; error: string; needsPassword?: boolean }> {
  const parsedResult = parseBackupFile(raw)
  if (!parsedResult.ok) return parsedResult
  const parsed = parsedResult.file

  const trimmed = password?.trim() ?? ''
  let keyHex = getWebKeyHex()
  const meta = getWebCryptoMeta()

  try {
    if (trimmed) {
      keyHex = await deriveKeyFromPassword(trimmed, parsed.salt)
    } else if (!keyHex) {
      return { ok: false, error: 'Introduce tu contraseña maestra para restaurar la copia.', needsPassword: true }
    } else if (meta?.salt && meta.salt !== parsed.salt) {
      return {
        ok: false,
        error: 'Esta copia usa otra sal. Introduce la contraseña maestra con la que se exportó.',
        needsPassword: true,
      }
    }
    if (!keyHex) return { ok: false, error: 'Introduce tu contraseña maestra para restaurar la copia.', needsPassword: true }

    const data = await decryptBackupFile(parsed, keyHex)
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
    return { ok: false, error: 'No se pudo descifrar la copia. Comprueba la contraseña.', needsPassword: true }
  }
}
