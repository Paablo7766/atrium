import Database from 'better-sqlite3-multiple-ciphers'
import fs from 'node:fs'
import path from 'node:path'
import { DB_FILENAME, TABLES } from './schema'
import { runMigrations } from './migrations'

export type NativeBindingEnv = {
  /** `app.isPackaged` from electron/main.ts — never infer this from cwd. */
  isPackaged: boolean
  /** Electron `process.resourcesPath` (packaged: `<install>/resources`). */
  resourcesPath: string
  /** Repo root in development (`dist-electron/..`). Unused when packaged. */
  projectRoot: string
  /** Directory of the running exe (`Atrium.exe`). Used if `isPackaged` is wrong. */
  execDir?: string
}

const SQLITE_PKG = 'better-sqlite3-multiple-ciphers'

function prebuildFileName(): string {
  const musl =
    process.platform === 'linux' &&
    !(process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined)?.header
      ?.glibcVersionRuntime
  return `${musl ? 'linuxmusl' : process.platform}-${process.arch}.node`
}

function bindingCandidates(pkgRoot: string): string[] {
  return [path.join(pkgRoot, 'build', 'Release', 'better_sqlite3.node'), path.join(pkgRoot, 'prebuilds', prebuildFileName())]
}

function unpackedPkgRoot(resourcesDir: string): string {
  return path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', SQLITE_PKG)
}

function uniqueRoots(roots: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const root of roots) {
    if (!root || seen.has(root)) continue
    seen.add(root)
    out.push(root)
  }
  return out
}

/**
 * Absolute path to better_sqlite3.node.
 *
 * Development (`npm run dev`, vitest):
 *   `<projectRoot>/node_modules/better-sqlite3-multiple-ciphers/...`
 *   Prefer this over `process.resourcesPath` — in dev that folder belongs to Electron.
 *
 * Packaged (electron-builder installer / `--dir`):
 *   `{resourcesPath}/app.asar.unpacked/node_modules/better-sqlite3-multiple-ciphers/...`
 *   `.node` binaries cannot be `dlopen`'d from inside `app.asar`.
 *
 * Some Windows installs report `app.isPackaged === false` even though the exe
 * lives in Local\\Programs\\Atrium. Always fall back to the unpacked resources.
 */
export function resolveNativeBindingPath(env: NativeBindingEnv): string {
  const devRoot = path.join(env.projectRoot, 'node_modules', SQLITE_PKG)
  const resourceRoots = [
    env.resourcesPath ? unpackedPkgRoot(env.resourcesPath) : '',
    env.execDir ? unpackedPkgRoot(path.join(env.execDir, 'resources')) : '',
  ]
  const pkgRoots = uniqueRoots(env.isPackaged ? [...resourceRoots, devRoot] : [devRoot, ...resourceRoots])
  const candidates = pkgRoots.flatMap(bindingCandidates)
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) {
    throw new Error(
      `Cannot find module better_sqlite3.node (NODE_MODULE_VERSION ${process.versions.modules}). Looked in: ${candidates.join(' | ')}`,
    )
  }
  return found
}

let nativeBindingOverride: string | null = null

/** Called from electron/main.ts with the env-specific absolute path. */
export function setNativeBindingPath(absolutePath: string): void {
  nativeBindingOverride = absolutePath
}

function resolveNativeBinding(): string {
  if (nativeBindingOverride) {
    if (!fs.existsSync(nativeBindingOverride)) {
      throw new Error(`Native binding missing at configured path: ${nativeBindingOverride}`)
    }
    return nativeBindingOverride
  }
  // Vitest / callers that did not go through electron/main.ts.
  return resolveNativeBindingPath({
    isPackaged: false,
    resourcesPath: typeof process.resourcesPath === 'string' ? process.resourcesPath : '',
    projectRoot: process.cwd(),
  })
}

function openSqlite(filename: string): Database.Database {
  return new Database(filename, { nativeBinding: resolveNativeBinding() })
}

/** SQLCipher KDF iterations — set after the key (SQLCipher 4 default is 256000). */
const KDF_ITER = 256_000

let dbInstance: Database.Database | null = null
let userDataDir: string | null = null
let encryptionKey: string | null = null
let lastCipherError: string | null = null

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

export function getLastCipherError(): string | null {
  return lastCipherError
}

function rememberCipherError(err: unknown): void {
  lastCipherError = err instanceof Error ? err.message : String(err)
  // Temporary diagnostic — full error in the Electron main process, not the renderer.
  console.error('[cipher] rememberCipherError', err)
  if (err instanceof Error) {
    console.error('[cipher] message:', err.message)
    console.error('[cipher] stack:', err.stack)
    const extra = err as Error & { code?: unknown; name?: string }
    if (extra.code != null) console.error('[cipher] code:', extra.code)
    if (extra.name) console.error('[cipher] name:', extra.name)
  }
}

function applyCipherPragmas(db: Database.Database, key: string): void {
  const hex = key.trim().toLowerCase()
  // SQLite3MultipleCiphers: cipher + legacy MUST be set before the key.
  // Classic SQLCipher wants key first; that would pick the default sqleet cipher here.
  db.pragma("cipher='sqlcipher'")
  db.pragma('legacy=4')
  if (/^[0-9a-f]{64}$/.test(hex)) {
    db.exec(`PRAGMA key = "x'${hex}'"`)
  } else {
    db.exec(`PRAGMA key = '${key.replace(/'/g, "''")}'`)
    db.pragma(`kdf_iter = ${KDF_ITER}`)
  }
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
  if (!tables.length) return true
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

/**
 * Check a key against an existing DB. Does not create journal.db — creating an
 * empty encrypted shell and closing it is what broke first-time setup on Windows.
 */
export function verifyDatabaseKey(key: string): boolean {
  lastCipherError = null
  const dbPath = getDbPath()
  if (!fs.existsSync(dbPath)) return true

  let db: Database.Database | null = null
  try {
    db = openSqlite(dbPath)
    applyCipherPragmas(db, key)
    return probeEncryptedSchema(db)
  } catch (err) {
    rememberCipherError(err)
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

  let db: Database.Database | null = null
  try {
    db = openSqlite(dbPath)
    applyCipherPragmas(db, encryptionKey)
    applySecurityPragmas(db)
    runMigrations(db)
  } catch (err) {
    rememberCipherError(err)
    try {
      db?.close()
    } catch {
      /* ignore */
    }
    throw err
  }
  dbInstance = db
  return db
}

export function openDatabaseWithKey(key: string): Database.Database {
  if (dbFileExists() && !verifyDatabaseKey(key)) {
    throw new Error(lastCipherError || 'Invalid encryption key')
  }
  closeDatabase()
  setEncryptionKey(key)
  return openDatabase()
}

export function getDatabase(): Database.Database {
  if (dbInstance) {
    if (!encryptionKey) {
      closeDatabase()
      throw new Error('Database locked: encryption key not set')
    }
    return dbInstance
  }
  return openDatabase()
}

export function isDatabaseOpen(): boolean {
  return dbInstance !== null
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      /* la base puede estar a medias; cerrar igual */
    }
    dbInstance.close()
    dbInstance = null
  }
}

/** Cambia la clave SQLCipher del diario abierto (p. ej. al pasar de clave del sistema a contraseña maestra). */
export function rekeyDatabase(newKeyHex: string): void {
  if (!dbInstance) throw new Error('Database not open')
  const hex = newKeyHex.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error('Invalid encryption key length')
  }
  dbInstance.exec(`PRAGMA rekey = "x'${hex}'"`)
  encryptionKey = hex
}
