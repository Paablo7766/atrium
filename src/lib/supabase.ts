/**
 * Cliente Supabase — OPCIONAL y SECUNDARIO a la base de datos local.
 *
 * Atrium funciona al 100 % sin Supabase: el diario vive en SQLite cifrado (escritorio)
 * o localStorage (web). Este módulo solo se usa cuando:
 *   1. VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY están definidos, Y
 *   2. El usuario activa explícitamente «Sync multi-dispositivo» en Ajustes.
 *
 * Incluso con sync activo, Supabase almacena únicamente blobs cifrados en cliente
 * (ver tradeSync.ts + syncCrypto.ts). Atrium no puede leer los datos del usuario en el servidor.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

/** true cuando las variables Vite de Supabase están definidas (sync aún puede estar desactivado). */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase no configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env (opcional).',
    )
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  }
  return client
}

/**
 * Cliente Supabase (lazy). Comprueba `isSupabaseConfigured()` antes de usarlo.
 * Nunca es necesario para persistencia local del diario.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const c = getClient()
    const value = Reflect.get(c, prop, receiver)
    return typeof value === 'function' ? value.bind(c) : value
  },
})
