/**
 * Gestión de clave en el navegador.
 * Solo contraseña maestra (no hay Keychain). La sal vive en localStorage y,
 * con sync activo, también en Supabase (user_crypto_salts — valor público PBKDF2).
 * La clave derivada permanece en memoria y nunca se persiste.
 */
import type { CryptoMeta, CryptoResult, CryptoStatus } from './types'
import { PBKDF2_ITERATIONS, SYNC_HKDF_INFO } from './types'
import { hasCanary, verifyCanary, writeCanary } from '@/lib/db/web/canary'
import { clearAesKeyCache } from '@/lib/db/web/recordCrypto'

export { PBKDF2_ITERATIONS } from './types'

export const WEB_CRYPTO_META_KEY = 'atrium:crypto-meta'

const KEY_BYTES = 32
const MIN_PASSWORD = 8

let memoryKeyHex: string | null = null

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim()
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Clave hex inválida.')
  }
  const out = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function generateSaltHex(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
}

export async function deriveKeyFromPassword(password: string, saltHex: string): Promise<string> {
  const salt = asBufferSource(hexToBytes(saltHex))
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    KEY_BYTES * 8,
  )
  return bytesToHex(new Uint8Array(bits))
}

/** HKDF-SHA256 — misma derivación que keyManagerMain / syncCrypto. */
export async function deriveSyncKeyHexFromDbKey(dbKeyHex: string): Promise<string> {
  const ikm = await crypto.subtle.importKey('raw', asBufferSource(hexToBytes(dbKeyHex)), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(SYNC_HKDF_INFO),
    },
    ikm,
    KEY_BYTES * 8,
  )
  return bytesToHex(new Uint8Array(bits))
}

function readMeta(): CryptoMeta | null {
  try {
    const raw = localStorage.getItem(WEB_CRYPTO_META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CryptoMeta>
    if (parsed.mode !== 'password') return null
    if (parsed.kdf !== 'pbkdf2') return null
    if (typeof parsed.iterations !== 'number' || parsed.iterations < PBKDF2_ITERATIONS) return null
    if (typeof parsed.salt !== 'string' || !/^[0-9a-f]+$/i.test(parsed.salt)) return null
    return { mode: 'password', salt: parsed.salt, kdf: 'pbkdf2', iterations: parsed.iterations }
  } catch {
    return null
  }
}

function writeMeta(meta: CryptoMeta): void {
  localStorage.setItem(WEB_CRYPTO_META_KEY, JSON.stringify(meta))
}

export function getWebCryptoMeta(): CryptoMeta | null {
  return readMeta()
}

export function getWebKeyHex(): string | null {
  return memoryKeyHex
}

export function setWebKeyHex(keyHex: string | null): void {
  memoryKeyHex = keyHex
  if (!keyHex) clearAesKeyCache()
}

export function isWebUnlocked(): boolean {
  return memoryKeyHex != null
}

export function clearWebKey(): void {
  memoryKeyHex = null
  clearAesKeyCache()
}

export type SetupMasterPasswordOptions = {
  /** Sal compartida (p. ej. descargada de Supabase en un segundo dispositivo). */
  saltHex?: string
  /** Comprueba que la clave derivada descifra datos remotos existentes. */
  verifyWithCloud?: (
    dbKeyHex: string,
  ) => Promise<{ ok: true; hasRemoteData: boolean } | { ok: false; error: string }>
}

/** Escribe la sal remota en localStorage sin clave ni canario (segundo dispositivo). */
export function stageLocalSalt(saltHex: string, iterations: number = PBKDF2_ITERATIONS): void {
  writeMeta({
    mode: 'password',
    salt: saltHex.trim().toLowerCase(),
    kdf: 'pbkdf2',
    iterations: iterations >= PBKDF2_ITERATIONS ? iterations : PBKDF2_ITERATIONS,
  })
}

/** true si hay sal local pero aún no hay canario (sal remota aplicada, falta contraseña). */
export async function hasStagedSaltOnly(): Promise<boolean> {
  const meta = readMeta()
  if (!meta?.salt) return false
  return !(await hasCanary())
}

export async function getCryptoStatus(): Promise<CryptoStatus> {
  const meta = readMeta()
  if (!meta) {
    return { configured: false, mode: null, secureStorageAvailable: false, needsUnlock: false }
  }
  const staged = await hasStagedSaltOnly()
  const locked = !memoryKeyHex && !staged && (await hasCanary())
  return {
    configured: true,
    mode: 'password',
    secureStorageAvailable: false,
    needsUnlock: locked,
  }
}

export async function setupMasterPassword(
  password: string,
  options?: SetupMasterPasswordOptions,
): Promise<CryptoResult> {
  const trimmed = password.trim()
  if (trimmed.length < MIN_PASSWORD) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' }
  }

  const existing = readMeta()
  const hasCanaryLocal = await hasCanary()
  if (existing && hasCanaryLocal && memoryKeyHex) {
    return { ok: false, error: 'El cifrado ya está configurado.' }
  }
  if (existing && hasCanaryLocal && !options?.saltHex) {
    return { ok: false, error: 'El cifrado ya está configurado.' }
  }

  const salt = (options?.saltHex ?? existing?.salt ?? generateSaltHex()).trim().toLowerCase()
  if (!/^[0-9a-f]{32}$/i.test(salt)) {
    return { ok: false, error: 'La sal de cifrado no es válida.' }
  }

  const key = await deriveKeyFromPassword(trimmed, salt)

  if (options?.verifyWithCloud) {
    const verified = await options.verifyWithCloud(key)
    if (!verified.ok) {
      return { ok: false, error: verified.error }
    }
    if (!verified.hasRemoteData && hasCanaryLocal) {
      if (!(await verifyCanary(key))) {
        return { ok: false, error: 'Contraseña incorrecta.' }
      }
    }
  } else if (hasCanaryLocal) {
    if (!(await verifyCanary(key))) {
      return { ok: false, error: 'Contraseña incorrecta.' }
    }
  }

  writeMeta({
    mode: 'password',
    salt,
    kdf: 'pbkdf2',
    iterations: existing?.iterations ?? PBKDF2_ITERATIONS,
  })
  memoryKeyHex = key
  try {
    await writeCanary(key)
  } catch (e) {
    try {
      localStorage.removeItem(WEB_CRYPTO_META_KEY)
    } catch {
      /* ignore */
    }
    memoryKeyHex = null
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo inicializar el cifrado en el navegador.' }
  }
  return { ok: true }
}

export async function unlockWithPassword(password: string): Promise<CryptoResult> {
  const meta = readMeta()
  if (!meta?.salt) return { ok: false, error: 'No hay contraseña maestra configurada.' }
  const trimmed = password.trim()
  if (!trimmed) return { ok: false, error: 'Introduce tu contraseña maestra.' }
  const key = await deriveKeyFromPassword(trimmed, meta.salt)
  if (!(await verifyCanary(key))) {
    return { ok: false, error: 'Contraseña incorrecta.' }
  }
  memoryKeyHex = key
  return { ok: true }
}

export async function tryAutoUnlock(): Promise<CryptoResult> {
  return { ok: false, error: 'El almacén seguro del sistema no está disponible en el navegador.' }
}

export async function setupSecureStorageKey(): Promise<CryptoResult> {
  return { ok: false, error: 'La clave automática del sistema no está disponible en el navegador.' }
}

export async function deriveSyncKeyHex(): Promise<{ ok: true; keyHex: string } | { ok: false; error: string }> {
  if (!memoryKeyHex) {
    return { ok: false, error: 'Desbloquea el diario con tu contraseña maestra antes de sincronizar.' }
  }
  return { ok: true, keyHex: await deriveSyncKeyHexFromDbKey(memoryKeyHex) }
}

export async function deriveSyncKeyFromPassword(
  password: string,
): Promise<{ ok: true; keyHex: string } | { ok: false; error: string }> {
  const meta = readMeta()
  if (!meta?.salt) return { ok: false, error: 'El cifrado por contraseña no está configurado.' }
  const trimmed = password.trim()
  if (!trimmed) return { ok: false, error: 'Introduce tu contraseña maestra.' }
  const dbKey = await deriveKeyFromPassword(trimmed, meta.salt)
  return { ok: true, keyHex: await deriveSyncKeyHexFromDbKey(dbKey) }
}

export function wipeWebCryptoMeta(): void {
  try {
    localStorage.removeItem(WEB_CRYPTO_META_KEY)
  } catch {
    /* ignore */
  }
  clearWebKey()
}

/** Test-only: replace in-memory key / meta without touching IndexedDB canary. */
export function resetWebCryptoForTests(): void {
  wipeWebCryptoMeta()
}

export function setWebKeyHexForTests(keyHex: string | null): void {
  setWebKeyHex(keyHex)
}
