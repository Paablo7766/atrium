import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3-multiple-ciphers'
import { parseJournalFile } from './import'
import { isDatabaseEmpty, saveJournal } from './repository'

const LEGACY_JSON = 'journal-data.json'

export function legacyJsonPath(userDataDir: string): string {
  return path.join(userDataDir, LEGACY_JSON)
}

export function migrateLegacyJsonIfNeeded(db: Database.Database, userDataDir: string): boolean {
  if (!isDatabaseEmpty(db)) return false
  const jsonPath = legacyJsonPath(userDataDir)
  if (!fs.existsSync(jsonPath)) return false

  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8')
    if (!raw.trim()) return false
    const parsed = parseJournalFile(JSON.parse(raw) as unknown)
    if (!parsed.ok) return false
    saveJournal(db, parsed.data)
    const migrated = `${jsonPath}.migrated`
    fs.renameSync(jsonPath, migrated)
    return true
  } catch {
    return false
  }
}
