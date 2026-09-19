import type Database from 'better-sqlite3-multiple-ciphers'
import type { JournalEntry } from '@/types'
import { TABLES, type JournalEntryRow } from '../schema'

export function rowToJournalEntry(row: JournalEntryRow): JournalEntry {
  return {
    id: row.id,
    date: row.date,
    mood: row.mood,
    title: row.title ?? '',
    content: row.content ?? '',
    updatedAt: row.updated_at,
  }
}

export function listJournalEntriesByAccount(db: Database.Database, accountId: string): JournalEntry[] {
  const rows = db
    .prepare(`SELECT * FROM ${TABLES.journalEntries} WHERE account_id = ? ORDER BY date DESC`)
    .all(accountId) as JournalEntryRow[]
  return rows.map(rowToJournalEntry)
}

export function replaceJournalEntriesForAccount(db: Database.Database, accountId: string, notes: JournalEntry[]): void {
  db.prepare(`DELETE FROM ${TABLES.journalEntries} WHERE account_id = ?`).run(accountId)
  const insert = db.prepare(`
    INSERT INTO ${TABLES.journalEntries} (id, account_id, date, mood, title, content, updated_at)
    VALUES (@id, @account_id, @date, @mood, @title, @content, @updated_at)
  `)
  for (const n of notes) {
    insert.run({
      id: n.id,
      account_id: accountId,
      date: n.date,
      mood: n.mood,
      title: n.title ?? '',
      content: n.content ?? '',
      updated_at: n.updatedAt,
    })
  }
}
