import type { PersistedData } from '@/types'
import { parseJournalFile, type DiskLoad } from '@/lib/persist'

type Filter = { name: string; extensions: string[] }

export type DiskLoadRaw = { status: 'empty' } | { status: 'ok'; data: unknown } | { status: 'corrupt'; message: string }

export type JournalBackup = {
  id: string
  kind: 'immediate' | 'dated'
  mtime: number
  bytes: number
}

export interface DesktopApi {
  load: () => Promise<DiskLoadRaw | PersistedData | null>
  save: (data: PersistedData) => Promise<boolean>
  saveSync?: (data: PersistedData) => boolean
  dataPath: () => Promise<string>
  openDataFolder: () => Promise<void>
  listBackups?: () => Promise<JournalBackup[]>
  restoreBackup?: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
  exportFile: (content: string, defaultName: string, filters: Filter[]) => Promise<boolean>
  importFile: (filters: Filter[]) => Promise<{ name: string; content: string } | null>
  platform: string
}

declare global {
  interface Window {
    api?: DesktopApi
  }
}

const LS_KEY = 'trading-journal:data'

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
    const r = result as DiskLoadRaw
    if (r.status === 'empty') return { status: 'empty' }
    if (r.status === 'corrupt') return { status: 'corrupt', message: r.message || 'El archivo de datos está dañado.' }
    if (r.status === 'ok') return fromRaw(r.data)
  }
  return fromRaw(result)
}

export async function loadData(): Promise<DiskLoad> {
  if (isDesktop()) {
    try {
      return wrapLoaded(await window.api!.load())
    } catch (e) {
      return { status: 'corrupt', message: e instanceof Error ? e.message : 'No se pudo leer el archivo de datos.' }
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { status: 'empty' }
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
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  } catch {
    throw new Error('No se pudo guardar en el navegador (almacenamiento lleno o bloqueado).')
  }
}

export async function saveData(data: PersistedData): Promise<void> {
  if (isDesktop()) {
    const ok = await window.api!.save(data)
    if (!ok) throw new Error('No se pudo guardar el archivo de datos.')
    return
  }
  writeBrowser(data)
}

export function saveDataSync(data: PersistedData): void {
  if (isDesktop()) {
    const fn = window.api!.saveSync
    const ok = fn ? fn(data) : false
    if (!ok) throw new Error('No se pudo guardar el archivo de datos.')
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
      resolve({ name: file.name, content: await file.text() })
    }
    input.click()
  })
}

export async function openDataFolder() {
  if (isDesktop()) await window.api!.openDataFolder()
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
