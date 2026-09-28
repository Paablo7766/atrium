import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, screen, session } from 'electron'
import path from 'node:path'

// Windows DPAPI / Keychain identity — must stay stable in dev and production (see productName).
app.setName('Atrium')
app.setPath('userData', path.join(app.getPath('appData'), process.env.ATRIUM_USER_DATA || 'atrium'))

import {
  getLitestreamStatus,
  initLitestream,
  openReplicaFolder,
  resetLitestreamDestination,
  restoreFromLitestreamReplica,
  restartLitestream,
  setLitestreamDestination,
  startLitestream,
  stopLitestream,
} from './litestream/manager'
import {
  chooseFolderBackupDestination,
  confirmPendingFolder,
  suggestedBackupDialogPath,
  flushFolderBackup,
  getFolderBackupStatus,
  initFolderBackup,
  scheduleFolderBackup,
  setFolderBackupEnabled,
} from './folderBackup'

import fs from 'node:fs'

import {

  prepareJournalDb,

  journalDataPath,

  journalLoad,

  journalSave,

  journalExportEncryptedBackup,

  journalImportEncryptedBackup,

  journalCryptoStatus,

  journalSetupPassword,

  journalMigrateToMasterPassword,

  journalSetupSecureStorage,

  journalUnlockPassword,

  journalTryAutoUnlock,

  journalWipeLocalStorage,

  listJournalBackups,

  restoreJournalBackup,

  shutdownJournalDb,

} from '@/lib/db/service'

import { resolveNativeBindingPath, setNativeBindingPath } from '@/lib/db/connection'
import { initDesktopUpdater, isQuittingForUpdate } from './updater'

import { deriveSyncKeyHexFromPassword, getSyncKeyHex } from '@/lib/crypto/keyManagerMain'
import { SHOW_LITESTREAM_PANEL } from '@/lib/featureFlags'
import { checkCryptoUnlockRateLimit } from './cryptoRateLimit'



const DIST = path.join(__dirname, '../dist')

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

/**
 * Native SQLCipher addon (.node cannot run from inside app.asar).
 *
 * Development (`npm run dev`):
 *   <repo>/node_modules/better-sqlite3-multiple-ciphers/build/Release/better_sqlite3.node
 *   or .../prebuilds/<platform>-<arch>.node
 *   Do not use process.resourcesPath here — in dev it points at Electron's own
 *   resources folder, not the project.
 *
 * Packaged (electron-builder, asarUnpack):
 *   {process.resourcesPath}/app.asar.unpacked/node_modules/better-sqlite3-multiple-ciphers/...
 */
{
  const nativeBinding = resolveNativeBindingPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot: path.join(__dirname, '..'),
    execDir: path.dirname(process.execPath),
  })
  console.error('[db] native binding', app.isPackaged ? 'packaged' : 'dev', nativeBinding)
  setNativeBindingPath(nativeBinding)
}



/** Max import payload (~25 MB) to avoid DoS via IPC. */

const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024



let win: BrowserWindow | null = null



const userDataDir = () => app.getPath('userData')

async function maybeStartLitestream() {
  if (!SHOW_LITESTREAM_PANEL) return
  await restartLitestream()
}



function isTrustedSender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {

  try {

    const wc = event.sender

    if (!wc || wc.isDestroyed()) return false

    if (!win || win.isDestroyed()) return false

    return wc.id === win.webContents.id

  } catch {

    return false

  }

}



function isSafeExternalUrl(url: string): boolean {

  try {

    const u = new URL(url)

    return u.protocol === 'https:' || u.protocol === 'http:'

  } catch {

    return false

  }

}



function sanitizeFilters(raw: unknown): { name: string; extensions: string[] }[] {

  if (!Array.isArray(raw)) return [{ name: 'All', extensions: ['*'] }]

  const out: { name: string; extensions: string[] }[] = []

  for (const item of raw) {

    if (!item || typeof item !== 'object') continue

    const name = typeof (item as { name?: unknown }).name === 'string' ? (item as { name: string }).name.slice(0, 80) : 'File'

    const exts = Array.isArray((item as { extensions?: unknown }).extensions)

      ? (item as { extensions: unknown[] }).extensions

          .filter((e): e is string => typeof e === 'string' && /^[a-z0-9*]{1,12}$/i.test(e))

          .slice(0, 20)

      : []

    if (exts.length) out.push({ name, extensions: exts })

  }

  return out.length ? out : [{ name: 'All', extensions: ['*'] }]

}



function sanitizePassword(raw: unknown): string | null {

  if (typeof raw !== 'string') return null

  const trimmed = raw.trim()

  if (trimmed.length > 256) return null

  return trimmed

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

      sandbox: true,

      webSecurity: true,

      allowRunningInsecureContent: false,

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

    if (isSafeExternalUrl(url)) void shell.openExternal(url)

    return { action: 'deny' }

  })



  win.webContents.on('will-navigate', (event, url) => {

    const allowed =

      (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)) ||

      url.startsWith('file://')

    if (!allowed) {

      event.preventDefault()

      if (isSafeExternalUrl(url)) void shell.openExternal(url)

    }

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



function applyContentSecurityPolicy() {

  const isDev = Boolean(VITE_DEV_SERVER_URL)

  const connect = [

    "'self'",

    'https://*.supabase.co',

    'wss://*.supabase.co',

    'https://*.supabase.in',

    'wss://*.supabase.in',

  ]

  if (isDev) {

    connect.push(

      'http://localhost:*',

      'ws://localhost:*',

      'http://127.0.0.1:*',

      'ws://127.0.0.1:*',

    )

  } else {

    connect.push(
      'https://eu.i.posthog.com',
      'https://us.i.posthog.com',
      'https://www.googleapis.com',
      'https://oauth2.googleapis.com',
    )
    const publicOrigin = (process.env.VITE_ATRIUM_PUBLIC_ORIGIN ?? process.env.ATRIUM_PUBLIC_ORIGIN ?? '')
      .trim()
      .replace(/\/$/, '')
    if (publicOrigin.startsWith('https://')) connect.push(publicOrigin)

  }

  const scriptSrc = isDev

    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"

    : "script-src 'self'"

  const csp = [

    "default-src 'self'",

    scriptSrc,

    "style-src 'self' 'unsafe-inline'",

    "img-src 'self' data: blob: https://financialmodelingprep.com https://images.fmp.com https://cdn.jsdelivr.net https://assets.parqet.com",

    "font-src 'self' data:",

    `connect-src ${connect.join(' ')}`,

    "worker-src 'self' blob:",

    "object-src 'none'",

    "base-uri 'self'",

    "form-action 'self'",

    "frame-ancestors 'none'",

  ].join('; ')



  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {

    const headers = { ...details.responseHeaders }

    headers['Content-Security-Policy'] = [csp]

    headers['X-Content-Type-Options'] = ['nosniff']

    callback({ responseHeaders: headers })

  })

}



// ---------- Cifrado / clave maestra ----------

ipcMain.handle('crypto:getStatus', (e) => {

  if (!isTrustedSender(e)) {

    return { configured: false, mode: null, secureStorageAvailable: false, needsUnlock: false }

  }

  return journalCryptoStatus()

})



ipcMain.handle('crypto:setupPassword', async (e, password: unknown) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  const pwd = sanitizePassword(password)

  if (!pwd) return { ok: false as const, error: 'Contraseña inválida' }

  console.error('[crypto:setupPassword] starting setup')

  const result = journalSetupPassword(pwd)

  if (!result.ok) console.error('[crypto:setupPassword] failed:', result.error)

  if (result.ok) await maybeStartLitestream()

  return result

})



ipcMain.handle('crypto:migrateToMasterPassword', async (e, password: unknown) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  const pwd = sanitizePassword(password)

  if (!pwd) return { ok: false as const, error: 'Contraseña inválida' }

  const result = journalMigrateToMasterPassword(pwd)

  if (!result.ok) console.error('[crypto:migrateToMasterPassword] failed:', result.error)

  return result

})



ipcMain.handle('crypto:setupSecureStorage', async (e) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  console.error('[crypto:setupSecureStorage] starting setup')

  const result = journalSetupSecureStorage()

  if (!result.ok) console.error('[crypto:setupSecureStorage] failed:', result.error)

  if (result.ok) await maybeStartLitestream()

  return result

})



ipcMain.handle('crypto:unlockPassword', async (e, password: unknown) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  const limited = checkCryptoUnlockRateLimit(e.sender.id)
  if (!limited.ok) {
    return { ok: false as const, error: `Demasiados intentos. Espera ${limited.retryAfterSec}s.` }
  }

  const pwd = sanitizePassword(password)

  if (!pwd) return { ok: false as const, error: 'Contraseña inválida' }

  const result = journalUnlockPassword(pwd)

  if (result.ok) {
    await maybeStartLitestream()
    scheduleFolderBackup()
  }

  return result

})



ipcMain.handle('crypto:tryAutoUnlock', async (e) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  const result = journalTryAutoUnlock()

  if (result.ok) await maybeStartLitestream()

  return result

})



ipcMain.handle('crypto:deriveSyncKey', (e) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  return getSyncKeyHex(userDataDir())

})



ipcMain.handle('crypto:deriveSyncKeyFromPassword', (e, password: unknown) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  const limited = checkCryptoUnlockRateLimit(e.sender.id)
  if (!limited.ok) {
    return { ok: false as const, error: `Demasiados intentos. Espera ${limited.retryAfterSec}s.` }
  }

  const pwd = sanitizePassword(password)

  if (!pwd) return { ok: false as const, error: 'Contraseña inválida' }

  return deriveSyncKeyHexFromPassword(userDataDir(), pwd)

})



ipcMain.handle('crypto:exportEncryptedBackup', async (e, data: unknown, password: unknown) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  const pwdRaw = typeof password === 'string' ? sanitizePassword(password) : undefined
  const journal =
    data && typeof data === 'object' ? (data as import('@/types').PersistedData) : undefined

  return journalExportEncryptedBackup(userDataDir(), journal, pwdRaw ?? undefined)

})



ipcMain.handle('crypto:importEncryptedBackup', async (e, raw: unknown, password: unknown) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  if (typeof raw !== 'string' || raw.length > MAX_PAYLOAD_BYTES) {
    return { ok: false as const, error: 'Archivo de copia inválido o demasiado grande.' }
  }

  const pwdRaw = typeof password === 'string' ? sanitizePassword(password) : undefined

  const limited = pwdRaw ? checkCryptoUnlockRateLimit(e.sender.id) : { ok: true as const }
  if (!limited.ok) {
    return { ok: false as const, error: `Demasiados intentos. Espera ${limited.retryAfterSec}s.` }
  }

  return journalImportEncryptedBackup(userDataDir(), raw, pwdRaw ?? undefined)

})



// ---------- Persistencia SQLite cifrada ----------

ipcMain.handle('data:load', (e) => {

  if (!isTrustedSender(e)) return { status: 'corrupt', message: 'IPC no autorizado' }

  try {

    return journalLoad()

  } catch (err) {

    return { status: 'corrupt', message: err instanceof Error ? err.message : 'No se pudo leer la base de datos' }

  }

})



ipcMain.handle('data:save', (e, data: unknown) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  if (!data || typeof data !== 'object') {
    return { ok: false as const, error: 'Datos de diario no válidos' }
  }

  const result = journalSave(data as import('@/types').PersistedData, userDataDir())

  if (result.ok) scheduleFolderBackup()

  return result

})



ipcMain.on('data:save-sync', (e, data: unknown) => {

  if (!isTrustedSender(e)) {

    e.returnValue = { ok: false as const, error: 'IPC no autorizado' }

    return

  }

  if (!data || typeof data !== 'object') {

    e.returnValue = { ok: false as const, error: 'Datos de diario no válidos' }

    return

  }

  const result = journalSave(data as import('@/types').PersistedData, userDataDir())

  if (result.ok) scheduleFolderBackup()

  e.returnValue = result

})



ipcMain.handle('app:dataPath', (e) => {

  if (!isTrustedSender(e)) return ''

  return journalDataPath()

})



ipcMain.handle('app:openDataFolder', (e) => {

  if (!isTrustedSender(e)) return

  shell.showItemInFolder(journalDataPath())

})



ipcMain.handle('data:wipeLocal', (e) => {

  if (!isTrustedSender(e)) return

  journalWipeLocalStorage(userDataDir())

})



ipcMain.handle('data:listBackups', (e) => {

  if (!isTrustedSender(e)) return []

  return listJournalBackups(userDataDir())

})



ipcMain.handle('data:restoreBackup', (e, id: unknown) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  if (typeof id !== 'string') return { ok: false as const, error: 'Identificador inválido' }

  return restoreJournalBackup(userDataDir(), id)

})



// ---------- Litestream (réplica continua) ----------

ipcMain.handle('litestream:getStatus', (e) => {

  if (!isTrustedSender(e)) {

    return {

      available: false,

      active: false,

      replicaPath: '',

      isCustomDestination: false,

      lastSync: null,

      error: 'IPC no autorizado',

    }

  }

  return getLitestreamStatus()

})



ipcMain.handle('litestream:chooseDestination', async (e) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  if (!win || win.isDestroyed()) return { ok: false as const, error: 'Ventana no disponible' }

  const res = await dialog.showOpenDialog(win, {

    properties: ['openDirectory', 'createDirectory'],

    title: 'Carpeta de copias Litestream',

  })

  if (res.canceled || !res.filePaths[0]) return { ok: false as const, error: 'cancelled' }

  return setLitestreamDestination(res.filePaths[0])

})



ipcMain.handle('litestream:resetDestination', async (e) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  return resetLitestreamDestination()

})



ipcMain.handle('litestream:restore', async (e) => {

  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }

  return restoreFromLitestreamReplica()

})



ipcMain.handle('litestream:openReplicaFolder', (e) => {

  if (!isTrustedSender(e)) return

  openReplicaFolder()

})



// ---------- Copia automática en carpeta ----------

ipcMain.handle('folderBackup:getStatus', (e) => {
  if (!isTrustedSender(e)) {
    return { enabled: false, folderPath: null, lastBackupAt: null, failed: false, needsPassword: false }
  }
  return getFolderBackupStatus()
})

ipcMain.handle('folderBackup:setEnabled', (e, enabled: unknown) => {
  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }
  return setFolderBackupEnabled(enabled === true)
})

ipcMain.handle('folderBackup:chooseFolder', async (e) => {
  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }
  if (!win || win.isDestroyed()) return { ok: false as const, error: 'Ventana no disponible' }
  const res = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Dónde guardar la copia (Google Drive, OneDrive…)',
    defaultPath: suggestedBackupDialogPath(),
    message: 'Puedes elegir «Mi unidad» de Google Drive: crearemos la carpeta Atrium por ti.',
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false as const, error: 'cancelled' }
  return chooseFolderBackupDestination(res.filePaths[0])
})

ipcMain.handle('folderBackup:confirmFolder', (e) => {
  if (!isTrustedSender(e)) return { ok: false as const, error: 'IPC no autorizado' }
  return confirmPendingFolder()
})



// ---------- Archivos ----------

ipcMain.handle(

  'file:export',

  async (

    e,

    payload: { content: string; defaultName: string; filters: { name: string; extensions: string[] }[] },

  ) => {

    if (!isTrustedSender(e)) return false

    if (!win || win.isDestroyed()) return false

    if (!payload || typeof payload.content !== 'string') return false

    if (payload.content.length > MAX_PAYLOAD_BYTES) return false

    const defaultName =

      typeof payload.defaultName === 'string' && payload.defaultName.trim()

        ? path.basename(payload.defaultName).slice(0, 120)

        : 'export.txt'

    const res = await dialog.showSaveDialog(win, {

      defaultPath: defaultName,

      filters: sanitizeFilters(payload.filters),

    })

    if (res.canceled || !res.filePath) return false

    fs.writeFileSync(res.filePath, payload.content, 'utf-8')

    return true

  },

)



ipcMain.handle('file:import', async (e, filters: { name: string; extensions: string[] }[]) => {

  if (!isTrustedSender(e)) return null

  if (!win || win.isDestroyed()) return null

  const res = await dialog.showOpenDialog(win, {

    properties: ['openFile'],

    filters: sanitizeFilters(filters),

  })

  if (res.canceled || !res.filePaths[0]) return null

  const p = res.filePaths[0]

  const st = fs.statSync(p)

  if (st.size > MAX_PAYLOAD_BYTES) return null

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

  app.whenReady().then(async () => {

    const dataDir = userDataDir()

    prepareJournalDb(dataDir)

    initFolderBackup(dataDir)

    initLitestream(dataDir, journalDataPath())

    if (SHOW_LITESTREAM_PANEL) {
      await startLitestream()
    }

    applyContentSecurityPolicy()

    createWindow()

    initDesktopUpdater({
      isPackaged: app.isPackaged,
      userDataDir: dataDir,
      isTrustedSender,
      getWindow: () => win,
      prepareToQuit: async () => {
        await flushFolderBackup().catch(() => undefined)
        await stopLitestream()
        shutdownJournalDb()
      },
    })

  })

}



app.on('window-all-closed', () => {
  if (isQuittingForUpdate()) {
    shutdownJournalDb()
    return
  }

  void flushFolderBackup()
    .catch(() => undefined)
    .then(() => stopLitestream())
    .finally(() => {

      shutdownJournalDb()

      if (process.platform !== 'darwin') app.quit()

    })

})



app.on('activate', () => {

  if (BrowserWindow.getAllWindows().length === 0) createWindow()

})


