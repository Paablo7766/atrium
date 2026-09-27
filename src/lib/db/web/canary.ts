import { openJournalDb } from './idb'
import { decryptRecord, encryptRecord, isEncryptedBlob } from './recordCrypto'

const CANARY_PLAIN = { atrium: 'canary', v: 1 as const }

export async function writeCanary(keyHex: string): Promise<void> {
  const db = await openJournalDb()
  await db.put('verify', await encryptRecord(CANARY_PLAIN, keyHex), 'canary')
}

export async function hasCanary(): Promise<boolean> {
  const db = await openJournalDb()
  return (await db.get('verify', 'canary')) != null
}

export async function verifyCanary(keyHex: string): Promise<boolean> {
  const db = await openJournalDb()
  const blob = await db.get('verify', 'canary')
  if (!isEncryptedBlob(blob)) return false
  try {
    const plain = await decryptRecord<typeof CANARY_PLAIN>(blob, keyHex)
    return plain.atrium === 'canary' && plain.v === 1
  } catch {
    return false
  }
}

/**
 * Comprueba la clave contra el canario o, si no se llegó a guardar, contra settings.
 * `absent` = no hay nada cifrado todavía (la contraseña puede establecer la clave).
 */
export async function verifyKeyMaterial(keyHex: string): Promise<'ok' | 'mismatch' | 'absent'> {
  if (await hasCanary()) {
    return (await verifyCanary(keyHex)) ? 'ok' : 'mismatch'
  }
  const db = await openJournalDb()
  const settings = await db.get('settings', '1')
  if (settings == null) return 'absent'
  if (!isEncryptedBlob(settings)) return 'mismatch'
  try {
    await decryptRecord(settings, keyHex)
    return 'ok'
  } catch {
    return 'mismatch'
  }
}
