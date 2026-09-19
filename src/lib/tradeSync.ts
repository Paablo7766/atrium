/**
 * Sync opcional multi-dispositivo vía Supabase.
 * Los datos se cifran en el cliente (AES-GCM) antes de subir — Supabase solo ve blobs.
 * La fuente de verdad sigue siendo la base de datos local cifrada (SQLite).
 */
import type { PersistedData } from '@/types'
import { readCloudSyncPref } from '@/lib/cloudSyncPref'
import {
  decryptJson,
  deriveSyncKeyFromDbKeyHex,
  encryptJson,
  type EncryptedBlob,
} from '@/lib/crypto/syncCrypto'
import { deriveSyncKeyHex } from '@/lib/crypto/keyManager'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const SNAPSHOT_TABLE = 'encrypted_sync_snapshots'

export type EncryptedSnapshotRow = {
  user_id: string
  ciphertext: string
  nonce: string
  cipher_version: number
  updated_at: string
  device_id: string | null
}

export type CloudJournalSnapshot = {
  updatedAt: number
  data: PersistedData
}

export type SyncPushResult = { ok: true; updatedAt: number } | { ok: false; error: string }

export type SyncPullResult =
  | { ok: true; snapshot: CloudJournalSnapshot | null }
  | { ok: false; error: string }

let localMutationAt = 0
let cachedDeviceId: string | null = null

function deviceId(): string {
  if (cachedDeviceId) return cachedDeviceId
  try {
    const stored = localStorage.getItem('atrium:deviceId')
    if (stored) {
      cachedDeviceId = stored
      return stored
    }
    const id = crypto.randomUUID()
    localStorage.setItem('atrium:deviceId', id)
    cachedDeviceId = id
    return id
  } catch {
    cachedDeviceId = 'unknown-device'
    return cachedDeviceId
  }
}

export function isCloudSyncActive(): boolean {
  return isSupabaseConfigured() && readCloudSyncPref()
}

export function bumpLocalMutationClock(at = Date.now()): void {
  localMutationAt = at
}

export function getLocalMutationAt(): number {
  return localMutationAt
}

/** Calcula el timestamp de última modificación a partir del journal. */
export function computeJournalMutationAt(data: PersistedData): number {
  let max = 0
  const bump = (iso?: string) => {
    if (!iso) return
    const parsed = Date.parse(iso)
    if (Number.isFinite(parsed) && parsed > max) max = parsed
  }

  for (const account of data.accounts ?? []) {
    for (const trade of account.trades ?? []) {
      bump(trade.updatedAt)
      bump(trade.createdAt)
    }
    for (const note of account.notes ?? []) bump(note.updatedAt)
    for (const flow of account.cashflows ?? []) bump(flow.date)
  }

  for (const setup of data.settings.playbook ?? []) {
    bump(setup.updatedAt)
    bump(setup.createdAt)
  }

  return max || Date.now()
}

/** Resolución de conflictos: última escritura gana (timestamp). */
export function resolveSyncConflict(
  local: PersistedData,
  localAt: number,
  cloud: PersistedData,
  cloudAt: number,
): { winner: 'local' | 'cloud'; data: PersistedData; at: number } {
  if (cloudAt > localAt) return { winner: 'cloud', data: cloud, at: cloudAt }
  return { winner: 'local', data: local, at: localAt }
}

async function requireSessionUserId(claimed?: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Sesión no válida. Vuelve a iniciar sesión.')
  if (claimed && claimed !== data.user.id) {
    throw new Error('No autorizado: el usuario de la sesión no coincide.')
  }
  return data.user.id
}

async function resolveSyncKey(): Promise<CryptoKey> {
  const derived = await deriveSyncKeyHex()
  if (!derived.ok) throw new Error(derived.error)
  return deriveSyncKeyFromDbKeyHex(derived.keyHex)
}

function rowToBlob(row: EncryptedSnapshotRow): EncryptedBlob {
  return {
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    cipherVersion: row.cipher_version,
  }
}

export async function pullEncryptedJournal(userId?: string): Promise<SyncPullResult> {
  if (!isCloudSyncActive()) return { ok: true, snapshot: null }

  try {
    const uid = await requireSessionUserId(userId)
    const { data, error } = await supabase
      .from(SNAPSHOT_TABLE)
      .select('user_id,ciphertext,nonce,cipher_version,updated_at,device_id')
      .eq('user_id', uid)
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: true, snapshot: null }

    const row = data as EncryptedSnapshotRow
    const key = await resolveSyncKey()
    const decrypted = await decryptJson<PersistedData>(rowToBlob(row), key)
    const updatedAt = Date.parse(row.updated_at)
    return {
      ok: true,
      snapshot: {
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
        data: decrypted,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo descargar la réplica cifrada.' }
  }
}

export async function pushEncryptedJournal(
  data: PersistedData,
  localUpdatedAt: number,
  userId?: string,
): Promise<SyncPushResult> {
  if (!isCloudSyncActive()) return { ok: true, updatedAt: localUpdatedAt }

  try {
    const uid = await requireSessionUserId(userId)
    const key = await resolveSyncKey()
    const blob = await encryptJson(data, key)
    const updatedIso = new Date(localUpdatedAt).toISOString()

    const { data: existing, error: readErr } = await supabase
      .from(SNAPSHOT_TABLE)
      .select('updated_at')
      .eq('user_id', uid)
      .maybeSingle()

    if (readErr) return { ok: false, error: readErr.message }

    if (existing?.updated_at) {
      const remoteAt = Date.parse(String(existing.updated_at))
      if (Number.isFinite(remoteAt) && remoteAt > localUpdatedAt) {
        return { ok: false, error: 'conflict:remote-newer' }
      }
    }

    const { error } = await supabase.from(SNAPSHOT_TABLE).upsert(
      {
        user_id: uid,
        ciphertext: blob.ciphertext,
        nonce: blob.nonce,
        cipher_version: blob.cipherVersion,
        updated_at: updatedIso,
        device_id: deviceId(),
      },
      { onConflict: 'user_id' },
    )

    if (error) return { ok: false, error: error.message }
    return { ok: true, updatedAt: localUpdatedAt }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo subir la réplica cifrada.' }
  }
}

/**
 * Sincroniza bidireccionalmente con resolución LWW.
 * Devuelve datos ganadores si el cloud es más reciente.
 */
export async function syncJournalWithCloud(
  local: PersistedData,
  localAt: number,
): Promise<
  | { ok: true; applied: 'none' | 'cloud' | 'local'; data: PersistedData; at: number }
  | { ok: false; error: string }
> {
  if (!isCloudSyncActive()) {
    return { ok: true, applied: 'none', data: local, at: localAt }
  }

  const pull = await pullEncryptedJournal()
  if (!pull.ok) return pull

  if (!pull.snapshot) {
    const push = await pushEncryptedJournal(local, localAt)
    if (!push.ok) {
      if (push.error === 'conflict:remote-newer') {
        const retry = await pullEncryptedJournal()
        if (retry.ok && retry.snapshot) {
          return { ok: true, applied: 'cloud', data: retry.snapshot.data, at: retry.snapshot.updatedAt }
        }
      }
      return push
    }
    bumpLocalMutationClock(push.updatedAt)
    return { ok: true, applied: 'local', data: local, at: push.updatedAt }
  }

  const resolved = resolveSyncConflict(local, localAt, pull.snapshot.data, pull.snapshot.updatedAt)

  if (resolved.winner === 'cloud') {
    bumpLocalMutationClock(resolved.at)
    return { ok: true, applied: 'cloud', data: resolved.data, at: resolved.at }
  }

  const push = await pushEncryptedJournal(local, localAt)
  if (!push.ok) {
    if (push.error === 'conflict:remote-newer' && pull.snapshot) {
      return { ok: true, applied: 'cloud', data: pull.snapshot.data, at: pull.snapshot.updatedAt }
    }
    return push
  }

  bumpLocalMutationClock(push.updatedAt)
  return { ok: true, applied: 'local', data: local, at: push.updatedAt }
}

/** Push debounced desde el store tras guardado local. */
export async function pushLocalJournalToCloud(data: PersistedData): Promise<void> {
  if (!isCloudSyncActive()) return
  const at = Math.max(getLocalMutationAt(), computeJournalMutationAt(data))
  const result = await pushEncryptedJournal(data, at)
  if (!result.ok && result.error !== 'conflict:remote-newer') {
    console.warn('[tradeSync] push:', result.error)
  }
}
