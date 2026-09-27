/** PBKDF2 iterations for master-password derivation (renderer + main). */
export const PBKDF2_ITERATIONS = 200_000

/** Info string HKDF para clave de sync E2E (renderer + main). */
export const SYNC_HKDF_INFO = 'atrium-sync-v1'

export type CryptoMode = 'password' | 'secure-storage'

export type CryptoMeta = {
  mode: CryptoMode
  salt?: string
  kdf: 'pbkdf2'
  iterations: number
  /**
   * HMAC-SHA256 de la clave derivada. Vive junto a la sal (fuera de la BD cifrada):
   * la tabla settings no se puede leer hasta tener la clave, así que no sirve para comprobar la contraseña.
   */
  verifier?: string
}

export type CryptoStatus = {
  configured: boolean
  mode: CryptoMode | null
  secureStorageAvailable: boolean
  needsUnlock: boolean
  /** Escritorio: existe journal.db. Sin archivo no hay diario que desbloquear. */
  hasDatabase?: boolean
}

export type CryptoStatusResponse = CryptoStatus

export type CryptoResult = { ok: true } | { ok: false; error: string }
