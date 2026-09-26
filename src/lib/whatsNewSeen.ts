const STORAGE_KEY = 'atrium.lastSeenAppVersion'

export function readLastSeenAppVersion(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const value = localStorage.getItem(STORAGE_KEY)?.trim()
    return value || null
  } catch {
    return null
  }
}

export function markAppVersionSeen(version: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    /* ignore quota / private mode */
  }
}

export function resolveLastSeenAppVersion(fromSettings?: string): string | null {
  return readLastSeenAppVersion() ?? (fromSettings?.trim() || null)
}
