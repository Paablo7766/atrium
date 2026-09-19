import Database from 'better-sqlite3-multiple-ciphers'

import fs from 'node:fs'

import path from 'node:path'

import { DB_FILENAME, TABLES } from './schema'

import { runMigrations } from './migrations'



/** SQLCipher KDF iterations — high value for key derivation (after legacy=4). */

const KDF_ITER = 256_000



let dbInstance: Database.Database | null = null

let userDataDir: string | null = null

let encryptionKey: string | null = null



export function setUserDataDir(dir: string): void {

  userDataDir = dir

}



export function getUserDataDir(): string {

  if (!userDataDir) throw new Error('userData directory not configured')

  return userDataDir

}



export function getDbPath(): string {

  return path.join(getUserDataDir(), DB_FILENAME)

}



export function dbFileExists(): boolean {

  return fs.existsSync(getDbPath())

}



export function setEncryptionKey(key: string): void {

  encryptionKey = key

}



export function clearEncryptionKey(): void {

  encryptionKey = null

}



export function hasEncryptionKey(): boolean {

  return encryptionKey !== null

}



/** Solo proceso principal — derivar clave de sync E2E cuando la BD está desbloqueada. */

export function getEncryptionKeyHex(): string | null {

  return encryptionKey

}



function applyCipherPragmas(db: Database.Database, key: string): void {

  db.pragma("cipher = 'sqlcipher'")

  db.pragma('legacy = 4')

  db.pragma(`kdf_iter = ${KDF_ITER}`)

  db.pragma(`key = "${key.replace(/"/g, '""')}"`)

}



function applySecurityPragmas(db: Database.Database): void {

  db.pragma('journal_mode = WAL')

  db.pragma('foreign_keys = ON')

  db.pragma('secure_delete = ON')

}



function probeEncryptedSchema(db: Database.Database): boolean {

  const tables = db

    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)

    .all() as { name: string }[]

  if (!tables.length) return false

  if (tables.some((t) => t.name === TABLES.migrations)) {

    db.prepare(`SELECT version FROM ${TABLES.migrations} LIMIT 1`).get()

    return true

  }

  if (tables.some((t) => t.name === TABLES.settings)) {

    db.prepare(`SELECT id FROM ${TABLES.settings} WHERE id = 1`).get()

    return true

  }

  return false

}



/** Verify the encryption key by probing the database schema. */

export function verifyDatabaseKey(key: string): boolean {

  const dbPath = getDbPath()

  const exists = fs.existsSync(dbPath)

  let db: Database.Database | null = null

  try {

    db = new Database(dbPath)

    applyCipherPragmas(db, key)

    if (!exists) {

      db.prepare('SELECT 1').get()

      return true

    }

    applySecurityPragmas(db)

    return probeEncryptedSchema(db)

  } catch {

    return false

  } finally {

    db?.close()

  }

}



export function openDatabase(): Database.Database {

  if (dbInstance) return dbInstance

  if (!encryptionKey) throw new Error('Database locked: encryption key not set')



  const dbPath = getDbPath()

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })



  const db = new Database(dbPath)

  applyCipherPragmas(db, encryptionKey)

  applySecurityPragmas(db)

  runMigrations(db)

  dbInstance = db

  return db

}



export function openDatabaseWithKey(key: string): Database.Database {

  if (!verifyDatabaseKey(key)) {

    throw new Error('Invalid encryption key')

  }

  closeDatabase()

  setEncryptionKey(key)

  return openDatabase()

}



export function getDatabase(): Database.Database {

  if (!dbInstance) return openDatabase()

  return dbInstance

}



export function isDatabaseOpen(): boolean {

  return dbInstance !== null

}



export function closeDatabase(): void {

  if (dbInstance) {

    dbInstance.close()

    dbInstance = null

  }

}


