import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

/** true cuando las variables Vite de Supabase están definidas. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase no configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env',
    )
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

/**
 * Cliente Supabase (lazy). Comprueba `isSupabaseConfigured()` antes de usarlo
 * en flujos opcionales / modo local.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const c = getClient()
    const value = Reflect.get(c, prop, receiver)
    return typeof value === 'function' ? value.bind(c) : value
  },
})
