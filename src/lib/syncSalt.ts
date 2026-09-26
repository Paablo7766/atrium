/**
 * Sync de la sal PBKDF2 entre dispositivos vía Supabase.
 *
 * SEGURIDAD — la sal es seguro almacenarla en claro en el servidor:
 * En PBKDF2 la sal es un valor público por diseño (como en .crypto-meta local).
 * Solo sirve junto con la contraseña maestra, que nunca se envía a Supabase.
 * Sin la contraseña, conocer la sal no permite derivar la clave ni descifrar el diario.
 */
import { PBKDF2_ITERATIONS } from '@/lib/crypto/types'
import {
  getWebCryptoMeta,
  stageLocalSalt,
} from '@/lib/crypto/keyManagerWeb'
import { hasCanary } from '@/lib/db/web/canary'
import { readCloudSyncPref } from '@/lib/cloudSyncPref'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const SALT_TABLE = 'user_crypto_salts'

export type RemoteSaltRow = {
  user_id: string
  salt: string
  kdf: string
  iterations: number
}

export type RemoteSalt = {
  salt: string
  iterations: number
}

export type SaltSyncResult = { ok: true } | { ok: false; error: string }

function isValidSaltHex(salt: string): boolean {
  return /^[0-9a-f]{32}$/i.test(salt.trim())
}

async function requireUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

/** Descarga la sal PBKDF2 del usuario autenticado (null si aún no existe). */
export async function pullRemoteSalt(): Promise<
  { ok: true; remote: RemoteSalt | null } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) return { ok: true, remote: null }

  try {
    const uid = await requireUserId()
    if (!uid) return { ok: true, remote: null }

    const { data, error } = await supabase
      .from(SALT_TABLE)
      .select('salt,iterations')
      .eq('user_id', uid)
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: true, remote: null }

    const row = data as Pick<RemoteSaltRow, 'salt' | 'iterations'>
    if (!isValidSaltHex(row.salt)) {
      return { ok: false, error: 'La sal remota no tiene un formato válido.' }
    }

    return {
      ok: true,
      remote: {
        salt: row.salt.toLowerCase(),
        iterations: row.iterations >= PBKDF2_ITERATIONS ? row.iterations : PBKDF2_ITERATIONS,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo descargar la sal remota.' }
  }
}

/** Sube la sal PBKDF2 local a Supabase (upsert por user_id). */
export async function pushRemoteSalt(salt: string, iterations: number = PBKDF2_ITERATIONS): Promise<SaltSyncResult> {
  if (!isSupabaseConfigured()) return { ok: true }

  const normalized = salt.trim().toLowerCase()
  if (!isValidSaltHex(normalized)) {
    return { ok: false, error: 'La sal local no tiene un formato válido.' }
  }

  try {
    const uid = await requireUserId()
    if (!uid) return { ok: true }

    const { error } = await supabase.from(SALT_TABLE).upsert(
      {
        user_id: uid,
        salt: normalized,
        kdf: 'pbkdf2',
        iterations: iterations >= PBKDF2_ITERATIONS ? iterations : PBKDF2_ITERATIONS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo subir la sal remota.' }
  }
}

/**
 * Sincroniza la sal entre local y Supabase:
 * - Segundo dispositivo: descarga sal remota y la deja en localStorage (sin clave).
 * - Compatibilidad: si hay sal local cifrada y no hay remota, sube la local existente.
 */
export async function ensureCryptoSaltSynced(): Promise<SaltSyncResult> {
  if (!isSupabaseConfigured() || !readCloudSyncPref()) return { ok: true }

  const uid = await requireUserId()
  if (!uid) return { ok: true }

  const local = getWebCryptoMeta()
  const pulled = await pullRemoteSalt()
  if (!pulled.ok) return pulled

  if (local?.salt && !pulled.remote) {
    return pushRemoteSalt(local.salt, local.iterations ?? PBKDF2_ITERATIONS)
  }

  if (pulled.remote && !local?.salt) {
    stageLocalSalt(pulled.remote.salt, pulled.remote.iterations)
    return { ok: true }
  }

  if (local?.salt && pulled.remote) {
    if (local.salt.toLowerCase() === pulled.remote.salt.toLowerCase()) {
      return { ok: true }
    }
    // Segundo dispositivo: sal remota aplicada antes de crear el diario local.
    if (!(await hasCanary())) {
      stageLocalSalt(pulled.remote.salt, pulled.remote.iterations)
      return { ok: true }
    }
    return {
      ok: false,
      error:
        'Este dispositivo tiene una sal de cifrado distinta a la de la nube. En un segundo dispositivo, usa «Ya tengo una cuenta» en la bienvenida antes de crear el diario, o borra los datos locales de este navegador.',
    }
  }

  return { ok: true }
}

/** true cuando sync está activo y existe sal remota (segundo dispositivo). */
export async function hasRemoteSaltForSetup(): Promise<boolean> {
  if (!isSupabaseConfigured() || !readCloudSyncPref()) return false
  const pulled = await pullRemoteSalt()
  return pulled.ok && pulled.remote != null
}
