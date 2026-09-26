/** Preferencia local: sync multi-dispositivo activado (independiente de la carga del store). */

export const CLOUD_SYNC_PREF = 'atrium:cloudSyncEnabled'

/**
 * Sync en la nube (Supabase) desactivado: sustituido por la copia automática en carpeta.
 * Con false no hay forma de activarlo (bienvenida, Ajustes, /login) y se ignora una preferencia antigua.
 */
export const CLOUD_SYNC_FEATURE_ENABLED = false

export function readCloudSyncPref(): boolean {
  if (!CLOUD_SYNC_FEATURE_ENABLED) return false
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(CLOUD_SYNC_PREF) === '1'
  } catch {
    return false
  }
}

export function writeCloudSyncPref(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (enabled) localStorage.setItem(CLOUD_SYNC_PREF, '1')
    else localStorage.removeItem(CLOUD_SYNC_PREF)
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Preferencia efectiva de sync: localStorage puede adelantarse al journal persistido
 * (p. ej. activaste sync e iniciaste sesión antes de que guardara en disco).
 */
export function resolveCloudSyncEnabled(settingsFlag?: boolean): boolean {
  if (!CLOUD_SYNC_FEATURE_ENABLED) return false
  return readCloudSyncPref() || !!settingsFlag
}

/** Aplica la preferencia de sync en localStorage y en settings del store. */
export function mergeCloudSyncSettings<T extends { cloudSyncEnabled?: boolean }>(
  settings: T,
): T & { cloudSyncEnabled: boolean } {
  const enabled = resolveCloudSyncEnabled(settings.cloudSyncEnabled)
  writeCloudSyncPref(enabled)
  return { ...settings, cloudSyncEnabled: enabled }
}
