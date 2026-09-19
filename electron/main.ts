import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const DIST = path.join(__dirname, '../dist')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let win: BrowserWindow | null = null

const dataFile = () => path.join(app.getPath('userData'), 'journal-data.json')
const backupsDir = () => path.join(path.dirname(dataFile()), 'backups')
const immediateBak = () => `${dataFile()}.bak`
const BACKUP_EVERY_MS = 10 * 60 * 1000
const BACKUP_KEEP = 10
let lastDatedBackup = 0

function looksLikeJournal(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const o = raw as Record<string, unknown>
  return (!!o.settings && typeof o.settings === 'object') || Array.isArray(o.accounts) || Array.isArray(o.trades)
}

function insideDir(dir: string, file: string) {
  const root = path.resolve(dir)
  const target = path.resolve(file)
  const prefix = root.toLowerCase()
  const full = target.toLowerCase()
  return full === prefix || full.startsWith(prefix + path.sep.toLowerCase())
}

function resolveBackup(id: string): string | null {
  if (id === 'latest.bak') {
    const p = path.resolve(immediateBak())
    return fs.existsSync(p) ? p : null
  }
  if (!/^journal-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(id)) return null
  const dir = backupsDir()
  const p = path.join(dir, id)
  if (!insideDir(dir, p) || !fs.existsSync(p)) return null
  return p
}

function pruneDatedBackups(dir: string, keepName?: string) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^journal-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(f) && f !== keepName)
    .sort()
  while (files.length > BACKUP_KEEP) {
    const old = files.shift()
    if (old) fs.unlinkSync(path.join(dir, old))
  }
}

function archiveCurrent(file: string, keepName?: string): boolean {
  if (!fs.existsSync(file)) return false
  try {
    const dir = backupsDir()
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    fs.copyFileSync(file, path.join(dir, `journal-${stamp}.json`))
    pruneDatedBackups(dir, keepName)
    return true
  } catch {
    return false
  }
}

function rotateBackups(file: string) {
  if (!fs.existsSync(file)) return
  try {
    fs.copyFileSync(file, `${file}.bak`)
  } catch {
    /* ignore */
  }
  const now = Date.now()
  if (now - lastDatedBackup < BACKUP_EVERY_MS) return
  if (archiveCurrent(file)) lastDatedBackup = now
}

function writeDataFile(data: unknown): boolean {
  try {
    const file = dataFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    rotateBackups(file)
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}

function createWindow() {
  nativeTheme.themeSource = 'dark'

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  win = new BrowserWindow({
    width: Math.min(1480, sw - 24),
    height: Math.min(920, sh - 24),
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#080809',
    title: 'Atrium',
    icon: path.join(app.isPackaged ? DIST : path.join(__dirname, '../public'), process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#080809',
      symbolColor: '#a1a1aa',
      height: 48,
    },
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const reveal = () => {
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  win.once('ready-to-show', reveal)
  win.webContents.once('did-finish-load', reveal)
  win.webContents.on('did-fail-load', () => reveal())
  setTimeout(reveal, 2500)

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(DIST, 'index.html'))
  }

  win.on('closed', () => {
    win = null
  })
}

// ---------- Persistencia ----------
ipcMain.handle('data:load', () => {
  try {
    const file = dataFile()
    if (!fs.existsSync(file)) return { status: 'empty' }
    const raw = fs.readFileSync(file, 'utf-8')
    if (!raw.trim()) return { status: 'empty' }
    try {
      return { status: 'ok', data: JSON.parse(raw) }
    } catch (e) {
      return { status: 'corrupt', message: e instanceof Error ? e.message : 'JSON inválido' }
    }
  } catch (e) {
    return { status: 'corrupt', message: e instanceof Error ? e.message : 'No se pudo leer el archivo' }
  }
})

ipcMain.handle('data:save', (_e, data: unknown) => writeDataFile(data))
ipcMain.on('data:save-sync', (e, data: unknown) => {
  e.returnValue = writeDataFile(data)
})

ipcMain.handle('app:dataPath', () => dataFile())

ipcMain.handle('app:openDataFolder', () => {
  shell.showItemInFolder(dataFile())
})

ipcMain.handle('data:listBackups', () => {
  const items: { id: string; kind: 'immediate' | 'dated'; mtime: number; bytes: number }[] = []
  try {
    const bak = immediateBak()
    if (fs.existsSync(bak)) {
      const st = fs.statSync(bak)
      items.push({ id: 'latest.bak', kind: 'immediate', mtime: st.mtimeMs, bytes: st.size })
    }
    const dir = backupsDir()
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) {
        if (!/^journal-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(name)) continue
        const p = path.join(dir, name)
        if (!insideDir(dir, p)) continue
        const st = fs.statSync(p)
        items.push({ id: name, kind: 'dated', mtime: st.mtimeMs, bytes: st.size })
      }
    }
  } catch {
    /* ignore */
  }
  return items.sort((a, b) => b.mtime - a.mtime)
})

ipcMain.handle('data:restoreBackup', (_e, id: unknown) => {
  if (typeof id !== 'string') return { ok: false as const, error: 'Identificador inválido' }
  const backupFile = resolveBackup(id)
  if (!backupFile) return { ok: false as const, error: 'No se encontró esa copia' }
  try {
    const parsed = JSON.parse(fs.readFileSync(backupFile, 'utf-8')) as unknown
    if (!looksLikeJournal(parsed)) return { ok: false as const, error: 'Esa copia no es un diario de Atrium' }
    const file = dataFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // Dated copy of whatever is current (including a corrupt file). Do not overwrite
    // journal-data.json.bak when that file is the restore source.
    archiveCurrent(file, id !== 'latest.bak' ? id : undefined)
    if (id !== 'latest.bak' && fs.existsSync(file)) {
      try {
        fs.copyFileSync(file, immediateBak())
      } catch {
        /* ignore */
      }
    }
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2), 'utf-8')
    fs.renameSync(tmp, file)
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'No se pudo restaurar' }
  }
})

// ---------- Archivos ----------
ipcMain.handle(
  'file:export',
  async (
    _e,
    payload: { content: string; defaultName: string; filters: { name: string; extensions: string[] }[] },
  ) => {
    if (!win) return false
    const res = await dialog.showSaveDialog(win, {
      defaultPath: payload.defaultName,
      filters: payload.filters,
    })
    if (res.canceled || !res.filePath) return false
    fs.writeFileSync(res.filePath, payload.content, 'utf-8')
    return true
  },
)

ipcMain.handle('file:import', async (_e, filters: { name: string; extensions: string[] }[]) => {
  if (!win) return null
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
  if (res.canceled || !res.filePaths[0]) return null
  const p = res.filePaths[0]
  return { name: path.basename(p), content: fs.readFileSync(p, 'utf-8') }
})

// ---------- Ciclo de vida ----------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  app.whenReady().then(createWindow)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
