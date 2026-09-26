/** Copia recibida vía Compartir → Atrium (PWA). */
export const PENDING_RESTORE_SESSION_KEY = 'atrium:pendingRestore'

const SHARE_CACHE = 'atrium-share-v1'
const SHARE_PENDING = 'pending-restore'

export async function consumeSharedBackupImport(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('atrium_import') !== '1') return null

  params.delete('atrium_import')
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
  window.history.replaceState({}, '', next)

  if (!('caches' in window)) return null
  try {
    const cache = await caches.open(SHARE_CACHE)
    const res = await cache.match(SHARE_PENDING)
    if (!res) return null
    const text = await res.text()
    await cache.delete(SHARE_PENDING)
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}

export function stashPendingRestore(raw: string): void {
  try {
    sessionStorage.setItem(PENDING_RESTORE_SESSION_KEY, raw)
  } catch {
    /* quota */
  }
}

export function takePendingRestore(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_RESTORE_SESSION_KEY)
    if (raw) sessionStorage.removeItem(PENDING_RESTORE_SESSION_KEY)
    return raw
  } catch {
    return null
  }
}

export function registerAtriumServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    /* offline / insecure context */
  })
}
