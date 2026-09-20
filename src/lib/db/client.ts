import type { PersistedData } from '@/types'
import { parseJournalFile } from './import'
import type { DiskLoad, DiskLoadRaw, Filter, JournalBackup, LitestreamStatus } from './types'
import {
  getCryptoStatus as getWebCryptoStatus,
  getWebKeyHex,
  wipeWebCryptoMeta,
} from '@/lib/crypto/keyManagerWeb'
import {
  buildEncryptedBackupFile,
  deleteJournalDb,
  exportEncryptedBackup as exportWebBackup,
  hasEncryptedJournal,
  importEncryptedBackup as importWebBackup,
  loadJournal as loadWebJournal,
  saveJournal as saveWebJournal,
} from './web'

export type { DiskLoad, DiskLoadRaw, Filter, JournalBackup, LitestreamStatus, DesktopApi } from './types'
export { parseJournalFile, parseJournalText } from './import'
export type { JournalParseOk, JournalParseFail, JournalParseResult } from './import'

export const LEGACY_BROWSER_LS_KEY = 'trading-journal:data'
const LS_KEY = LEGACY_BROWSER_LS_KEY
/** ~8 MB — evita saturar localStorage con payloads maliciosos. */
const MAX_BROWSER_BYTES = 8 * 1024 * 1024
const MAX_IMPORT_BYTES = 25 * 1024 * 1024

export const isDesktop = () => typeof window !== 'undefined' && !!window.api

function fromRaw(raw: unknown): DiskLoad {
  const parsed = parseJournalFile(raw)
  if (!parsed.ok) return { status: 'corrupt', message: parsed.error }
  return {
    status: 'ok',
    data: parsed.data,
    skippedTrades: parsed.skippedTrades,
    skippedNotes: parsed.skippedNotes,
  }
}

function wrapLoaded(result: unknown): DiskLoad {
  if (result == null) return { status: 'empty' }
  if (typeof result === 'object' && result && 'status' in result) {
    const r = result as DiskLoadRaw & { status: string }
    if (r.status === 'empty') return { status: 'empty' }
    if (r.status === 'locked') return { status: 'locked' }
    if (r.status === 'unrecoverable') {
      return { status: 'unrecoverable', message: r.message || 'Los datos cifrados no son recuperables.' }
    }
    if (r.status === 'corrupt') return { status: 'corrupt', message: r.message || 'El archivo de datos está dañado.' }
    if (r.status === 'ok') return fromRaw(r.data)
  }
  return fromRaw(result)
}

function readLegacyBrowser(): DiskLoad | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    try {
      return fromRaw(JSON.parse(raw) as unknown)
    } catch {
      return { status: 'corrupt', message: 'El almacenamiento local no es JSON válido.' }
    }
  } catch (e) {
    return { status: 'corrupt', message: e instanceof Error ? e.message : 'No se pudo leer el almacenamiento local.' }
  }
}

function writeBrowser(data: PersistedData) {
  try {
    const raw = JSON.stringify(data)
    if (raw.length > MAX_BROWSER_BYTES) {
      throw new Error('Los datos son demasiado grandes para el navegador. Usa la app de escritorio.')
    }
    localStorage.setItem(LS_KEY, raw)
  } catch (e) {
    if (e instanceof Error && e.message.includes('demasiado grandes')) throw e
    throw new Error('No se pudo guardar en el navegador (almacenamiento lleno o bloqueado).')
  }
}

export function clearLegacyBrowser() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}

/** Datos antiguos en claro (localStorage) antes del cifrado IndexedDB. */
export function hasLegacyBrowserJournal(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return !!localStorage.getItem(LS_KEY)
  } catch {
    return false
  }
}

/** Comprueba si el JSON legacy contiene datos sensibles de trades/journal. */
export function legacyBrowserJournalHasSensitiveData(): boolean {
  const legacy = readLegacyBrowser()
  if (!legacy || legacy.status !== 'ok') return false
  const data = legacy.data
  if (data.accounts?.length) {
    return data.accounts.some(
      (a) => (a.trades?.length ?? 0) > 0 || (a.notes?.length ?? 0) > 0 || (a.cashflows?.length ?? 0) > 0,
    )
  }
  return (data.trades?.length ?? 0) > 0 || (data.notes?.length ?? 0) > 0
}

/**
 * Migra datos legacy de localStorage a IndexedDB cifrado y borra la copia en claro.
 * Requiere contraseña maestra configurada y clave en memoria.
 */
export async function migrateLegacyBrowserToEncrypted(
  data: PersistedData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isDesktop()) return { ok: true }
  if (!getWebKeyHex()) {
    return { ok: false, error: 'Configura tu contraseña maestra antes de migrar los datos.' }
  }
  try {
    await saveWebJournal(data)
    clearLegacyBrowser()
    if (hasLegacyBrowserJournal()) {
      return { ok: false, error: 'No se pudo borrar la copia antigua en localStorage.' }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo migrar al almacenamiento cifrado.' }
  }
}

export async function loadData(): Promise<DiskLoad> {
  if (isDesktop()) {
    try {
      return wrapLoaded(await window.api!.load())
    } catch (e) {
      return { status: 'corrupt', message: e instanceof Error ? e.message : 'No se pudo leer la base de datos.' }
    }
  }

  try {
    const status = await getWebCryptoStatus()
    if (status.needsUnlock) return { status: 'locked' }
    if (status.configured && !getWebKeyHex()) {
      if (await hasEncryptedJournal()) return { status: 'locked' }
    }

    if (getWebKeyHex()) {
      try {
        const data = await loadWebJournal()
        if (!data) return { status: 'empty' }
        return fromRaw(data)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'No se pudo leer IndexedDB.'
        if (message.includes('bloqueado')) return { status: 'locked' }
        return { status: 'corrupt', message }
      }
    }

    const legacy = readLegacyBrowser()
    return legacy ?? { status: 'empty' }
  } catch (e) {
    return { status: 'corrupt', message: e instanceof Error ? e.message : 'No se pudo leer el almacenamiento local.' }
  }
}

async function writeWeb(data: PersistedData): Promise<void> {
  if (getWebKeyHex()) {
    await saveWebJournal(data)
    clearLegacyBrowser()
    return
  }
  const status = await getWebCryptoStatus()
  if (status.configured) {
    throw new Error('El diario está bloqueado. Introduce tu contraseña maestra.')
  }
  writeBrowser(data)
}

export async function saveData(data: PersistedData): Promise<void> {
  if (isDesktop()) {
    const ok = await window.api!.save(data)
    if (!ok) throw new Error('No se pudo guardar en la base de datos.')
    return
  }
  await writeWeb(data)
}

export function saveDataSync(data: PersistedData): void {
  if (isDesktop()) {
    const fn = window.api!.saveSync
    const ok = fn ? fn(data) : false
    if (!ok) throw new Error('No se pudo guardar en la base de datos.')
    return
  }
  if (getWebKeyHex()) {
    void saveWebJournal(data).then(() => clearLegacyBrowser())
    return
  }
  writeBrowser(data)
}

export async function exportFile(content: string, defaultName: string, filters: Filter[]) {
  if (isDesktop()) return window.api!.exportFile(content, defaultName, filters)
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  a.click()
  URL.revokeObjectURL(url)
  return true
}

export async function importFile(filters: Filter[]): Promise<{ name: string; content: string } | null> {
  if (isDesktop()) return window.api!.importFile(filters)
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',')
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      if (file.size > MAX_IMPORT_BYTES) {
        resolve(null)
        return
      }
      resolve({ name: file.name, content: await file.text() })
    }
    input.click()
  })
}

export async function openDataFolder() {
  if (isDesktop()) await window.api!.openDataFolder()
}

export async function wipeLocalStorage() {
  if (isDesktop() && window.api?.wipeLocal) {
    await window.api.wipeLocal()
    return
  }
  await deleteJournalDb()
  wipeWebCryptoMeta()
  clearLegacyBrowser()
}

export async function listBackups(): Promise<JournalBackup[]> {
  if (!isDesktop() || !window.api?.listBackups) return []
  try {
    return await window.api.listBackups()
  } catch {
    return []
  }
}

export async function restoreBackup(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDesktop() || !window.api?.restoreBackup) {
    return { ok: false, error: 'Las copias automáticas solo existen en la app de escritorio.' }
  }
  try {
    return await window.api.restoreBackup(id)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo restaurar.' }
  }
}

export async function exportEncryptedBackup(data?: PersistedData): Promise<string> {
  if (isDesktop()) {
    const crypto = window.api?.crypto
    if (!crypto?.getExportMaterial) {
      throw new Error('La exportación cifrada no está disponible en esta versión de escritorio.')
    }
    const material = await crypto.getExportMaterial()
    if (!material.ok) throw new Error(material.error)
    let journal = data
    if (!journal) {
      const loaded = await loadData()
      if (loaded.status !== 'ok') throw new Error('No hay un diario que exportar.')
      journal = loaded.data
    }
    return buildEncryptedBackupFile(journal, material.keyHex, material.salt, material.iterations)
  }
  return exportWebBackup(data)
}

export async function importEncryptedBackup(
  raw: string,
  password?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await importWebBackup(raw, password)
  if (!result.ok) return result
  return { ok: true }
}

const EMPTY_LITESTREAM_STATUS: LitestreamStatus = {
  available: false,
  active: false,
  replicaPath: '',
  isCustomDestination: false,
  lastSync: null,
  error: null,
}

export async function getLitestreamStatus(): Promise<LitestreamStatus> {
  if (!isDesktop() || !window.api?.litestream) return EMPTY_LITESTREAM_STATUS
  try {
    return await window.api.litestream.getStatus()
  } catch {
    return EMPTY_LITESTREAM_STATUS
  }
}

export async function chooseLitestreamDestination(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDesktop() || !window.api?.litestream) {
    return { ok: false, error: 'Litestream solo está disponible en la app de escritorio.' }
  }
  try {
    return await window.api.litestream.chooseDestination()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo elegir la carpeta.' }
  }
}

export async function resetLitestreamDestination(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDesktop() || !window.api?.litestream) {
    return { ok: false, error: 'Litestream solo está disponible en la app de escritorio.' }
  }
  try {
    return await window.api.litestream.resetDestination()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo restaurar el destino predeterminado.' }
  }
}

export async function restoreLitestreamReplica(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDesktop() || !window.api?.litestream) {
    return { ok: false, error: 'Litestream solo está disponible en la app de escritorio.' }
  }
  try {
    return await window.api.litestream.restore()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo restaurar desde Litestream.' }
  }
}

export async function openLitestreamReplicaFolder(): Promise<void> {
  if (!isDesktop() || !window.api?.litestream) return
  try {
    await window.api.litestream.openReplicaFolder()
  } catch {
    /* ignore */
  }
}
