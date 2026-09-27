import { app, ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import electronUpdater from 'electron-updater'
import {
  computeUpdateOffer,
  emptyUpdaterStatus,
  nsisUpdateInstallOptions,
  type DesktopUpdaterState,
  type DesktopUpdaterStatus,
} from '@/lib/desktopUpdater'
import { parseUpdaterPrefs, serializeUpdaterPrefs, type UpdaterPrefs } from './updaterPrefs'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
const FIRST_CHECK_DELAY_MS = 4_000
const RESTART_AFTER_DOWNLOAD_MS = 800
const PREFS_FILE = 'updater-prefs.json'

let quittingForUpdate = false

export function isQuittingForUpdate(): boolean {
  return quittingForUpdate
}

type Trusted = (event: IpcMainInvokeEvent | IpcMainEvent) => boolean

function getAutoUpdater() {
  return electronUpdater.autoUpdater
}

function isPortableBuild(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
}

function notesFromInfo(info: { releaseNotes?: string | Array<{ note: string | null }> | null }): string | null {
  const notes = info.releaseNotes
  if (typeof notes === 'string' && notes.trim()) return notes
  if (Array.isArray(notes)) {
    const joined = notes.map((item) => item.note ?? '').filter(Boolean).join('\n')
    return joined || null
  }
  return null
}

export function initDesktopUpdater(opts: {
  isPackaged: boolean
  userDataDir: string
  isTrustedSender: Trusted
  getWindow: () => BrowserWindow | null
  prepareToQuit?: () => Promise<void>
}): void {
  const canUpdate = opts.isPackaged && !isPortableBuild()
  const prefsPath = path.join(opts.userDataDir, PREFS_FILE)

  let prefs: UpdaterPrefs = { allowPrerelease: false }
  try {
    prefs = parseUpdaterPrefs(JSON.parse(fs.readFileSync(prefsPath, 'utf8')))
  } catch {
    prefs = { allowPrerelease: false }
  }

  let state: DesktopUpdaterState = 'idle'
  let availableVersion: string | null = null
  let releaseNotes: string | null = null
  let error: string | null = null
  let downloadPercent: number | null = null
  let dismissedVersion: string | null = null
  let lastProgress = -1
  let checking = false
  let installing = false
  let userRequestedDownload = false
  let restartTimer: ReturnType<typeof setTimeout> | null = null

  const snapshot = (): DesktopUpdaterStatus => ({
    supported: canUpdate,
    currentVersion: app.getVersion(),
    allowPrerelease: prefs.allowPrerelease,
    state,
    availableVersion,
    releaseNotes,
    error,
    downloadPercent,
    offer: canUpdate && computeUpdateOffer({ state, availableVersion, dismissedVersion }),
  })

  const sendStatus = () => {
    const win = opts.getWindow()
    if (!win || win.isDestroyed()) return
    win.webContents.send('updater:status', snapshot())
  }

  const savePrefs = () => {
    fs.mkdirSync(opts.userDataDir, { recursive: true })
    fs.writeFileSync(prefsPath, serializeUpdaterPrefs(prefs), { encoding: 'utf8', mode: 0o600 })
  }

  const installAndRelaunch = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!canUpdate) return { ok: false as const, error: 'Solo el instalador NSIS puede actualizarse' }
    if (state !== 'downloaded' && state !== 'restarting') {
      return { ok: false as const, error: 'La actualización aún no está lista para instalar' }
    }
    if (installing) return { ok: true as const }
    installing = true
    quittingForUpdate = true
    state = 'restarting'
    error = null
    sendStatus()
    if (restartTimer) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
    try {
      await opts.prepareToQuit?.()
    } catch (err) {
      console.warn('[updater] prepareToQuit', err)
    }
    try {
      const { isSilent, isForceRunAfter } = nsisUpdateInstallOptions()
      getAutoUpdater().quitAndInstall(isSilent, isForceRunAfter)
      return { ok: true as const }
    } catch (err) {
      installing = false
      quittingForUpdate = false
      state = 'error'
      error = err instanceof Error ? err.message : 'No se pudo instalar la actualización'
      sendStatus()
      return { ok: false as const, error }
    }
  }

  const check = async () => {
    if (!canUpdate || checking || installing) return
    if (state === 'downloading' || state === 'downloaded' || state === 'restarting') return
    checking = true
    state = 'checking'
    error = null
    sendStatus()
    try {
      await getAutoUpdater().checkForUpdates()
    } catch (err) {
      state = 'error'
      error = err instanceof Error ? err.message : 'No se pudo comprobar si hay actualizaciones'
      sendStatus()
    } finally {
      checking = false
    }
  }

  if (canUpdate) {
    const updater = getAutoUpdater()
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = true
    updater.autoRunAppAfterInstall = true
    updater.allowPrerelease = prefs.allowPrerelease
    updater.logger = {
      info: (...args: unknown[]) => console.log('[updater]', ...args),
      warn: (...args: unknown[]) => console.warn('[updater]', ...args),
      error: (...args: unknown[]) => console.error('[updater]', ...args),
      debug: () => undefined,
    }

    updater.on('checking-for-update', () => {
      if (installing || state === 'downloading' || state === 'downloaded' || state === 'restarting') return
      state = 'checking'
      error = null
      sendStatus()
    })
    updater.on('update-available', (info) => {
      if (installing || state === 'downloading' || state === 'downloaded' || state === 'restarting') return
      state = 'available'
      availableVersion = info.version
      releaseNotes = notesFromInfo(info)
      error = null
      sendStatus()
    })
    updater.on('update-not-available', () => {
      if (installing || state === 'downloading' || state === 'downloaded' || state === 'restarting') return
      state = 'not-available'
      availableVersion = null
      releaseNotes = null
      downloadPercent = null
      error = null
      sendStatus()
    })
    updater.on('download-progress', (progress) => {
      const pct = Math.round(progress.percent)
      if (state === 'downloading' && pct === lastProgress) return
      lastProgress = pct
      state = 'downloading'
      downloadPercent = pct
      sendStatus()
    })
    updater.on('update-downloaded', (info) => {
      state = 'downloaded'
      availableVersion = info.version
      releaseNotes = notesFromInfo(info) ?? releaseNotes
      downloadPercent = 100
      error = null
      sendStatus()
      if (!userRequestedDownload || installing) return
      restartTimer = setTimeout(() => {
        restartTimer = null
        void installAndRelaunch()
      }, RESTART_AFTER_DOWNLOAD_MS)
    })
    updater.on('error', (err) => {
      if (installing) return
      state = 'error'
      error = err instanceof Error ? err.message : String(err)
      sendStatus()
    })

    setTimeout(() => {
      void check()
    }, FIRST_CHECK_DELAY_MS)
    setInterval(() => {
      void check()
    }, CHECK_INTERVAL_MS)
  }

  ipcMain.handle('updater:getStatus', (event) => {
    if (!opts.isTrustedSender(event)) return emptyUpdaterStatus(app.getVersion())
    return snapshot()
  })

  ipcMain.handle('updater:setAllowPrerelease', (event, enabled: unknown) => {
    if (!opts.isTrustedSender(event)) return emptyUpdaterStatus(app.getVersion())
    prefs = { allowPrerelease: enabled === true }
    savePrefs()
    if (canUpdate) {
      getAutoUpdater().allowPrerelease = prefs.allowPrerelease
      void check()
    }
    sendStatus()
    return snapshot()
  })

  ipcMain.handle('updater:download', async (event) => {
    if (!opts.isTrustedSender(event)) return { ok: false as const, error: 'IPC no autorizado' }
    if (!canUpdate) return { ok: false as const, error: 'Solo el instalador NSIS puede actualizarse' }
    if (state !== 'available' && state !== 'error') {
      return { ok: false as const, error: 'No hay una actualización lista para descargar' }
    }
    dismissedVersion = null
    userRequestedDownload = true
    state = 'downloading'
    downloadPercent = 0
    error = null
    sendStatus()
    try {
      await getAutoUpdater().downloadUpdate()
      return { ok: true as const }
    } catch (err) {
      state = 'error'
      error = err instanceof Error ? err.message : 'No se pudo descargar la actualización'
      sendStatus()
      return { ok: false as const, error }
    }
  })

  ipcMain.handle('updater:installAndRestart', async (event) => {
    if (!opts.isTrustedSender(event)) return { ok: false as const, error: 'IPC no autorizado' }
    return installAndRelaunch()
  })

  ipcMain.handle('updater:dismiss', (event) => {
    if (!opts.isTrustedSender(event)) return emptyUpdaterStatus(app.getVersion())
    if (state === 'downloading' || state === 'downloaded' || state === 'restarting') return snapshot()
    dismissedVersion = availableVersion
    sendStatus()
    return snapshot()
  })
}
