/**

 * API pública de cifrado para el renderer.

 * La derivación PBKDF2, generación de claves y safeStorage viven en el proceso principal

 * (keyManagerMain.ts) y se invocan de forma segura vía IPC (preload → main).

 */

import { isDesktop } from '@/lib/db/client'

import type { CryptoResult, CryptoStatusResponse } from './types'



export type { CryptoMeta, CryptoMode, CryptoStatus, CryptoStatusResponse, CryptoResult } from './types'

export { PBKDF2_ITERATIONS } from './types'



const UNAVAILABLE = 'El cifrado local solo está disponible en la app de escritorio.'



function cryptoApi() {

  if (!isDesktop() || !window.api?.crypto) return null

  return window.api.crypto

}



/** Estado del cifrado: modo, si hace falta contraseña al arrancar, disponibilidad de safeStorage. */

export async function getCryptoStatus(): Promise<CryptoStatusResponse> {

  const api = cryptoApi()

  if (!api) {

    return { configured: false, mode: null, secureStorageAvailable: false, needsUnlock: false }

  }

  return api.getStatus()

}



/**

 * Configura cifrado con contraseña maestra.

 * Solo persiste la sal; la clave se deriva con PBKDF2 (≥200.000 iteraciones) en el main.

 */

export async function setupMasterPassword(password: string): Promise<CryptoResult> {

  const api = cryptoApi()

  if (!api) return { ok: false, error: UNAVAILABLE }

  return api.setupPassword(password)

}



/**

 * Configura cifrado con clave aleatoria guardada en safeStorage del SO

 * (Keychain / Credential Manager / Secret Service).

 */

export async function setupSecureStorageKey(): Promise<CryptoResult> {

  const api = cryptoApi()

  if (!api) return { ok: false, error: UNAVAILABLE }

  return api.setupSecureStorage()

}



/** Desbloquea la base de datos con la contraseña maestra. */

export async function unlockWithPassword(password: string): Promise<CryptoResult> {

  const api = cryptoApi()

  if (!api) return { ok: false, error: UNAVAILABLE }

  return api.unlockPassword(password)

}



/** Intenta recuperar la clave del almacén seguro del SO al arrancar. */

export async function tryAutoUnlock(): Promise<CryptoResult> {

  const api = cryptoApi()

  if (!api) return { ok: false, error: UNAVAILABLE }

  return api.tryAutoUnlock()

}



export type SyncKeyResult = { ok: true; keyHex: string } | { ok: false; error: string }



/** Clave derivada (HKDF) para cifrar blobs de sync — requiere BD desbloqueada en escritorio. */

export async function deriveSyncKeyHex(): Promise<SyncKeyResult> {

  const api = cryptoApi()

  if (!api?.deriveSyncKey) {

    return { ok: false, error: 'Deriva la clave de sync desde la app de escritorio con la BD desbloqueada.' }

  }

  return api.deriveSyncKey()

}



/** Deriva clave de sync desde contraseña maestra (modo password, BD bloqueada). */

export async function deriveSyncKeyFromPassword(password: string): Promise<SyncKeyResult> {

  const api = cryptoApi()

  if (!api?.deriveSyncKeyFromPassword) {

    return { ok: false, error: UNAVAILABLE }

  }

  return api.deriveSyncKeyFromPassword(password)

}


