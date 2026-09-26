/**
 * API pública de cifrado para el renderer.
 * Escritorio: IPC → keyManagerMain.ts (proceso principal).
 * Navegador: keyManagerWeb.ts (PBKDF2 + Web Crypto; sin Keychain).
 */
import { isDesktop } from '@/lib/db/client'
import type { CryptoResult, CryptoStatusResponse } from './types'
import * as web from './keyManagerWeb'

export type { CryptoMeta, CryptoMode, CryptoStatus, CryptoStatusResponse, CryptoResult } from './types'
export { PBKDF2_ITERATIONS } from './types'

export type SyncKeyResult = { ok: true; keyHex: string } | { ok: false; error: string }

function cryptoApi() {
  if (!isDesktop() || !window.api?.crypto) return null
  return window.api.crypto
}

/** Estado del cifrado: modo, si hace falta contraseña al arrancar, disponibilidad de safeStorage. */
export async function getCryptoStatus(): Promise<CryptoStatusResponse> {
  if (!isDesktop()) return web.getCryptoStatus()
  const api = cryptoApi()
  if (!api) {
    return { configured: false, mode: null, secureStorageAvailable: false, needsUnlock: false }
  }
  return api.getStatus()
}

/**
 * Configura cifrado con contraseña maestra.
 * Solo persiste la sal; la clave se deriva con PBKDF2 (≥200.000 iteraciones).
 */
export async function setupMasterPassword(
  password: string,
  options?: web.SetupMasterPasswordOptions,
): Promise<CryptoResult> {
  if (!isDesktop()) return web.setupMasterPassword(password, options)
  const api = cryptoApi()
  if (!api) return { ok: false, error: 'El cifrado local no está disponible.' }
  return api.setupPassword(password)
}

/** Escritorio: pasa de clave del sistema a contraseña maestra sin perder el diario. */
export async function migrateToMasterPassword(password: string): Promise<CryptoResult> {
  if (!isDesktop()) return { ok: false, error: 'Solo está disponible en la app de ordenador.' }
  const api = cryptoApi()
  if (!api?.migrateToMasterPassword) {
    return { ok: false, error: 'Actualiza la app de escritorio para usar esta opción.' }
  }
  return api.migrateToMasterPassword(password)
}

/**
 * Configura cifrado con clave aleatoria guardada en safeStorage del SO
 * (Keychain / Credential Manager / Secret Service). No existe en el navegador.
 */
export async function setupSecureStorageKey(): Promise<CryptoResult> {
  if (!isDesktop()) return web.setupSecureStorageKey()
  const api = cryptoApi()
  if (!api) return { ok: false, error: 'El cifrado local no está disponible.' }
  return api.setupSecureStorage()
}

/** Desbloquea la base de datos con la contraseña maestra. */
export async function unlockWithPassword(password: string): Promise<CryptoResult> {
  if (!isDesktop()) return web.unlockWithPassword(password)
  const api = cryptoApi()
  if (!api) return { ok: false, error: 'El cifrado local no está disponible.' }
  return api.unlockPassword(password)
}

/** Intenta recuperar la clave del almacén seguro del SO al arrancar. */
export async function tryAutoUnlock(): Promise<CryptoResult> {
  if (!isDesktop()) return web.tryAutoUnlock()
  const api = cryptoApi()
  if (!api) return { ok: false, error: 'El cifrado local no está disponible.' }
  return api.tryAutoUnlock()
}

/** Clave derivada (HKDF) para cifrar blobs de sync — requiere diario desbloqueado. */
export async function deriveSyncKeyHex(): Promise<SyncKeyResult> {
  if (!isDesktop()) return web.deriveSyncKeyHex()
  const api = cryptoApi()
  if (!api?.deriveSyncKey) {
    return { ok: false, error: 'Deriva la clave de sync desde la app de escritorio con la BD desbloqueada.' }
  }
  return api.deriveSyncKey()
}

/** Deriva clave de sync desde contraseña maestra (modo password, BD bloqueada). */
export async function deriveSyncKeyFromPassword(password: string): Promise<SyncKeyResult> {
  if (!isDesktop()) return web.deriveSyncKeyFromPassword(password)
  const api = cryptoApi()
  if (!api?.deriveSyncKeyFromPassword) {
    return { ok: false, error: 'El cifrado local no está disponible.' }
  }
  return api.deriveSyncKeyFromPassword(password)
}
