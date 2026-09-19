/** Preferencia local: sync multi-dispositivo activado (independiente de la carga del store). */

export const CLOUD_SYNC_PREF = 'atrium:cloudSyncEnabled'

export function readCloudSyncPref(): boolean {
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
