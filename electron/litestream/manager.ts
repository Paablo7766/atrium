import { app, shell } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { journalDataPath, prepareJournalDb, shutdownJournalDb } from '@/lib/db/service'
import { buildLitestreamConfig } from './config'

const SETTINGS_FILE = '.litestream-settings.json'
const CONFIG_FILE = 'litestream.yml'
const DEFAULT_REPLICA_DIR = 'litestream'

export type LitestreamSettings = {
  replicaPath?: string
}

export type LitestreamStatus = {
  available: boolean
  active: boolean
  replicaPath: string
  isCustomDestination: boolean
  lastSync: number | null
  error: string | null
}

let child: ChildProcess | null = null
let lastError: string | null = null
let userDataDir = ''
let dbPath = ''

function platformDir(): string {
  if (process.platform === 'win32') return 'win32'
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
}

function binaryName(): string {
  return process.platform === 'win32' ? 'litestream.exe' : 'litestream'
}

export function resolveLitestreamBinary(): string | null {
  const subdir = platformDir()
  const exe = binaryName()

  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'litestream', subdir, exe)]
    : [path.join(__dirname, '../electron/resources/litestream', subdir, exe)]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function settingsPath(): string {
  return path.join(userDataDir, SETTINGS_FILE)
}

function configPath(): string {
  return path.join(userDataDir, CONFIG_FILE)
}

function defaultReplicaPath(): string {
  return path.join(userDataDir, 'backups', DEFAULT_REPLICA_DIR)
}

function readSettings(): LitestreamSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8')
    return JSON.parse(raw) as LitestreamSettings
  } catch {
    return {}
  }
}

function writeSettings(settings: LitestreamSettings): void {
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

export function getReplicaPath(): string {
  const custom = readSettings().replicaPath?.trim()
  return custom || defaultReplicaPath()
}

function writeConfig(sourceDb: string, replica: string): void {
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.mkdirSync(replica, { recursive: true })
  fs.writeFileSync(configPath(), buildLitestreamConfig(sourceDb, replica), 'utf-8')
}

function walkLatestMtime(dir: string): number | null {
  if (!fs.existsSync(dir)) return null
  let latest: number | null = null

  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const mtime = fs.statSync(full).mtimeMs
        if (latest == null || mtime > latest) latest = mtime
      } catch {
        /* ignore unreadable files */
      }
    }
  }
  return latest
}

function isRunning(): boolean {
  return child != null && !child.killed && child.exitCode == null
}

function stopProcess(): Promise<void> {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      child = null
      resolve()
      return
    }
    const proc = child
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        /* already dead */
      }
    }, 5000)

    proc.once('exit', () => {
      clearTimeout(timer)
      if (child === proc) child = null
      resolve()
    })

    try {
      proc.kill(process.platform === 'win32' ? undefined : 'SIGTERM')
    } catch {
      clearTimeout(timer)
      child = null
      resolve()
    }
  })
}

function runLitestream(args: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const binary = resolveLitestreamBinary()
  if (!binary) return Promise.resolve({ ok: false, error: 'Binario de Litestream no encontrado.' })

  return new Promise((resolve) => {
    execFile(binary, args, { windowsHide: true, timeout: 120_000 }, (err, _stdout, stderr) => {
      if (err) {
        const msg = (stderr || err.message || 'Litestream falló').trim()
        resolve({ ok: false, error: msg.slice(0, 500) })
        return
      }
      resolve({ ok: true })
    })
  })
}

export function initLitestream(dataDir: string, databasePath: string): void {
  userDataDir = dataDir
  dbPath = databasePath
}

export async function startLitestream(): Promise<void> {
  const binary = resolveLitestreamBinary()
  if (!binary) {
    lastError = 'Binario de Litestream no empaquetado para esta plataforma.'
    return
  }
  if (!dbPath || !fs.existsSync(dbPath)) {
    lastError = null
    return
  }

  await stopProcess()

  const replica = getReplicaPath()
  writeConfig(dbPath, replica)

  lastError = null
  const proc = spawn(binary, ['replicate', '-config', configPath()], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env },
  })
  child = proc

  proc.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString('utf-8').trim()
    if (line.toLowerCase().includes('error')) lastError = line.slice(0, 500)
  })

  proc.on('exit', (code, signal) => {
    if (child === proc && code != null && code !== 0) {
      lastError = `Litestream terminó (${signal ?? `código ${code}`}).`
    }
    if (child === proc) child = null
  })
}

export async function stopLitestream(): Promise<void> {
  await stopProcess()
}

export async function restartLitestream(): Promise<void> {
  await startLitestream()
}

export function getLitestreamStatus(): LitestreamStatus {
  const replicaPath = getReplicaPath()
  const binary = resolveLitestreamBinary()
  const defaultPath = defaultReplicaPath()
  const custom = readSettings().replicaPath?.trim()

  return {
    available: Boolean(binary),
    active: isRunning(),
    replicaPath,
    isCustomDestination: Boolean(custom && path.resolve(custom) !== path.resolve(defaultPath)),
    lastSync: walkLatestMtime(replicaPath),
    error: lastError,
  }
}

export async function setLitestreamDestination(replicaPath: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!replicaPath.trim()) return { ok: false, error: 'Ruta inválida.' }

  const resolved = path.resolve(replicaPath)
  const dbResolved = path.resolve(dbPath)
  if (resolved === dbResolved || resolved.startsWith(dbResolved + path.sep)) {
    return { ok: false, error: 'El destino no puede estar dentro del archivo de datos.' }
  }

  try {
    fs.mkdirSync(resolved, { recursive: true })
    writeSettings({ replicaPath: resolved })
    await restartLitestream()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo configurar el destino.' }
  }
}

export async function resetLitestreamDestination(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    writeSettings({})
    fs.mkdirSync(defaultReplicaPath(), { recursive: true })
    await restartLitestream()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo restaurar el destino predeterminado.' }
  }
}

export async function restoreFromLitestreamReplica(): Promise<{ ok: true } | { ok: false; error: string }> {
  const replica = getReplicaPath()
  if (!fs.existsSync(replica)) {
    return { ok: false, error: 'No hay réplica Litestream en el destino configurado.' }
  }

  const latest = walkLatestMtime(replica)
  if (latest == null) {
    return { ok: false, error: 'La réplica existe pero no contiene datos restaurables.' }
  }

  await stopLitestream()
  shutdownJournalDb()

  const target = dbPath || journalDataPath()
  const bak = `${target}.pre-litestream-restore`
  try {
    if (fs.existsSync(target)) fs.copyFileSync(target, bak)
  } catch {
    /* best effort backup */
  }

  const result = await runLitestream(['restore', '-o', target, replica])
  if (!result.ok) {
    if (fs.existsSync(bak)) {
      try {
        fs.copyFileSync(bak, target)
      } catch {
        /* ignore */
      }
    }
    prepareJournalDb(userDataDir)
    await startLitestream()
    return result
  }

  prepareJournalDb(userDataDir)
  await startLitestream()
  return { ok: true }
}

export function openReplicaFolder(): void {
  const replica = getReplicaPath()
  fs.mkdirSync(replica, { recursive: true })
  void shell.openPath(replica)
}
