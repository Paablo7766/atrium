import type { PersistedData } from '@/types'
import type { CryptoResult, CryptoStatusResponse } from '@/lib/crypto/types'

export type DiskLoad =
  | { status: 'empty' }
  | { status: 'ok'; data: PersistedData; skippedTrades: number; skippedNotes: number }
  | { status: 'locked' }
  | { status: 'unrecoverable'; message: string }
  | { status: 'corrupt'; message: string }

export type { CryptoResult, CryptoStatusResponse } from '@/lib/crypto/types'

export type DiskLoadRaw =
  | { status: 'empty' }
  | { status: 'locked' }
  | { status: 'unrecoverable'; message: string }
  | { status: 'ok'; data: unknown }
  | { status: 'corrupt'; message: string }

export type JournalBackup = {
  id: string
  kind: 'immediate' | 'dated'
  mtime: number
  bytes: number
}

export type LitestreamStatus = {
  available: boolean
  active: boolean
  replicaPath: string
  isCustomDestination: boolean
  lastSync: number | null
  error: string | null
}

export type Filter = { name: string; extensions: string[] }

export interface DesktopApi {
  load: () => Promise<DiskLoadRaw | PersistedData | null>
  save: (data: PersistedData) => Promise<boolean>
  saveSync?: (data: PersistedData) => boolean
  dataPath: () => Promise<string>
  openDataFolder: () => Promise<void>
  wipeLocal?: () => Promise<void>
  listBackups?: () => Promise<JournalBackup[]>
  restoreBackup?: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
  litestream?: {
    getStatus: () => Promise<LitestreamStatus>
    chooseDestination: () => Promise<{ ok: true } | { ok: false; error: string }>
    resetDestination: () => Promise<{ ok: true } | { ok: false; error: string }>
    restore: () => Promise<{ ok: true } | { ok: false; error: string }>
    openReplicaFolder: () => Promise<void>
  }
  exportFile: (content: string, defaultName: string, filters: Filter[]) => Promise<boolean>
  importFile: (filters: Filter[]) => Promise<{ name: string; content: string } | null>
  platform: string
  crypto?: {
    getStatus: () => Promise<CryptoStatusResponse>
    setupPassword: (password: string) => Promise<CryptoResult>
    setupSecureStorage: () => Promise<CryptoResult>
    unlockPassword: (password: string) => Promise<CryptoResult>
    tryAutoUnlock: () => Promise<CryptoResult>
    deriveSyncKey?: () => Promise<{ ok: true; keyHex: string } | { ok: false; error: string }>
    deriveSyncKeyFromPassword?: (password: string) => Promise<{ ok: true; keyHex: string } | { ok: false; error: string }>
  }
}

declare global {
  interface Window {
    api?: DesktopApi
  }
}
