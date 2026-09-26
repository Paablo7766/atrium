import type Database from 'better-sqlite3-multiple-ciphers'
import { SCHEMA_VERSION, TABLES } from '../schema'
import { SQL_001_INITIAL } from './001_initial'
import { SQL_002_CLOUD_SYNC_SETTINGS } from './002_cloud_sync_settings'
import { SQL_003_LAST_SEEN_APP_VERSION } from './003_last_seen_app_version'

const MIGRATION_SQL: Record<number, string> = {
  1: SQL_001_INITIAL,
  2: SQL_002_CLOUD_SYNC_SETTINGS,
  3: SQL_003_LAST_SEEN_APP_VERSION,
}

function currentVersion(db: Database.Database): number {
  try {
    const row = db.prepare(`SELECT MAX(version) AS v FROM ${TABLES.migrations}`).get() as { v: number | null } | undefined
    return row?.v ?? 0
  } catch {
    return 0
  }
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLES.migrations} (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const from = currentVersion(db)
  if (from >= SCHEMA_VERSION) return

  for (let v = from + 1; v <= SCHEMA_VERSION; v++) {
    const sql = MIGRATION_SQL[v]
    if (!sql) throw new Error(`Unknown migration version ${v}`)
    db.transaction(() => {
      db.exec(sql)
      db.prepare(`INSERT INTO ${TABLES.migrations} (version) VALUES (?)`).run(v)
    })()
  }
}
