import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { EncryptedBlob } from '@/lib/crypto/syncCrypto'

export const JOURNAL_IDB_NAME = 'atrium-journal'
export const JOURNAL_IDB_VERSION = 1

export const WEB_STORES = [
  'settings',
  'accounts',
  'trades',
  'journal_entries',
  'cashflows',
  'playbook_setups',
  'playbook_items',
  'verify',
] as const

export type WebStoreName = (typeof WEB_STORES)[number]

interface AtriumJournalDB extends DBSchema {
  settings: { key: string; value: EncryptedBlob }
  accounts: { key: string; value: EncryptedBlob }
  trades: { key: string; value: EncryptedBlob }
  journal_entries: { key: string; value: EncryptedBlob }
  cashflows: { key: string; value: EncryptedBlob }
  playbook_setups: { key: string; value: EncryptedBlob }
  playbook_items: { key: string; value: EncryptedBlob }
  verify: { key: string; value: EncryptedBlob }
}

let dbPromise: Promise<IDBPDatabase<AtriumJournalDB>> | null = null

export function openJournalDb(): Promise<IDBPDatabase<AtriumJournalDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AtriumJournalDB>(JOURNAL_IDB_NAME, JOURNAL_IDB_VERSION, {
      upgrade(db) {
        for (const name of WEB_STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
        }
      },
    })
  }
  return dbPromise
}

export async function closeJournalDb(): Promise<void> {
  if (!dbPromise) return
  try {
    const db = await dbPromise
    db.close()
  } catch {
    /* ignore */
  }
  dbPromise = null
}

export async function deleteJournalDb(): Promise<void> {
  await closeJournalDb()
  await deleteDB(JOURNAL_IDB_NAME)
}

export async function countStore(name: WebStoreName): Promise<number> {
  const db = await openJournalDb()
  return db.count(name)
}
