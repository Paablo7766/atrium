import { compareSemver } from '@/lib/changelog'

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

/** Prefer the oldest recorded “seen” version so a stale localStorage entry cannot skip the card. */
export function resolveLastSeenAppVersion(fromSettings?: string): string | null {
  const fromDb = fromSettings?.trim() || null
  const fromLs = readLastSeenAppVersion()
  if (!fromDb) return fromLs
  if (!fromLs) return fromDb
  return compareSemver(fromDb, fromLs) <= 0 ? fromDb : fromLs
}
