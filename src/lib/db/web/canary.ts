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
