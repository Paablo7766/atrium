import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearEncryptionKey,
  closeDatabase,
  dbFileExists,
  getDatabase,
  getDbPath,
  openDatabaseWithKey,
  resolveNativeBindingPath,
  setUserDataDir,
  verifyDatabaseKey,
} from './connection'
import { TABLES } from './schema'

const SQLITE_HEADER = Buffer.from('SQLite format 3', 'utf8')

describe('connection (SQLCipher)', () => {
  const dirs: string[] = []

  afterEach(() => {
    closeDatabase()
    clearEncryptionKey()
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  function tempDir(): string {
    const dir = path.join(os.tmpdir(), `atrium-conn-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    dirs.push(dir)
    setUserDataDir(dir)
    return dir
  }

  it('no crea journal.db al verificar una ruta vacía', () => {
    tempDir()
    const key = crypto.randomBytes(32).toString('hex')
    expect(verifyDatabaseKey(key)).toBe(true)
    expect(dbFileExists()).toBe(false)
  })

  it('abre una BD nueva en un solo paso (setup clave automática)', () => {
    tempDir()
    const key = crypto.randomBytes(32).toString('hex')

    expect(dbFileExists()).toBe(false)
    openDatabaseWithKey(key)

    const row = getDatabase()
      .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name = ?`)
      .get(TABLES.migrations) as { n: number }
    expect(row.n).toBe(1)

    const header = fs.readFileSync(getDbPath()).subarray(0, SQLITE_HEADER.length)
    expect(header.equals(SQLITE_HEADER)).toBe(false)
  })

  it('rechaza una clave distinta y reabre con la correcta', () => {
    tempDir()
    const key = crypto.randomBytes(32).toString('hex')
    const other = crypto.randomBytes(32).toString('hex')
    openDatabaseWithKey(key)
    closeDatabase()
    clearEncryptionKey()

    expect(verifyDatabaseKey(other)).toBe(false)
    expect(() => openDatabaseWithKey(other)).toThrow()

    closeDatabase()
    clearEncryptionKey()
    openDatabaseWithKey(key)
    const row = getDatabase()
      .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name = ?`)
      .get(TABLES.migrations) as { n: number }
    expect(row.n).toBe(1)
  })

  it('resuelve el .node desde node_modules en desarrollo, no desde resourcesPath', () => {
    const root = tempDir()
    const pkg = path.join(root, 'node_modules', 'better-sqlite3-multiple-ciphers', 'prebuilds')
    fs.mkdirSync(pkg, { recursive: true })
    const prebuild = `${process.platform}-${process.arch}.node`
    const expected = path.join(pkg, prebuild)
    fs.writeFileSync(expected, '')
    const decoy = path.join(root, 'electron-resources', 'app.asar.unpacked', 'node_modules', 'better-sqlite3-multiple-ciphers', 'prebuilds')
    fs.mkdirSync(decoy, { recursive: true })
    fs.writeFileSync(path.join(decoy, prebuild), 'wrong')

    expect(
      resolveNativeBindingPath({
        isPackaged: false,
        resourcesPath: path.join(root, 'electron-resources'),
        projectRoot: root,
      }),
    ).toBe(expected)
  })

  it('resuelve el .node desde app.asar.unpacked cuando está empaquetado', () => {
    const root = tempDir()
    const unpacked = path.join(root, 'resources', 'app.asar.unpacked', 'node_modules', 'better-sqlite3-multiple-ciphers', 'prebuilds')
    fs.mkdirSync(unpacked, { recursive: true })
    const prebuild = `${process.platform}-${process.arch}.node`
    const expected = path.join(unpacked, prebuild)
    fs.writeFileSync(expected, '')

    expect(
      resolveNativeBindingPath({
        isPackaged: true,
        resourcesPath: path.join(root, 'resources'),
        projectRoot: path.join(root, 'should-not-use'),
      }),
    ).toBe(expected)
  })
})
