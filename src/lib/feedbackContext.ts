import { useStore, type Page } from '@/store'
import { pathForPage } from '@/lib/routes'
import { getAppLocale } from '@/lib/i18n'
import { CLOUD_SYNC_FEATURE_ENABLED, resolveCloudSyncEnabled } from '@/lib/cloudSyncPref'
import { isCloudSyncActive } from '@/lib/tradeSync'
import type { FeedbackDiagnostics, FeedbackOpenFrom } from '../../lib/discordFeedback'

function currentAppPath(page: Page): string {
  if (typeof window === 'undefined') return pathForPage(page)
  const { pathname, hash } = window.location
  if (hash.startsWith('#/')) {
    const segment = hash.slice(1).split('?')[0] ?? '/'
    return segment.startsWith('/') ? segment : `/${segment}`
  }
  if (pathname && pathname !== '/') return pathname
  return pathForPage(page)
}

function cloudSyncLabel(settingsFlag?: boolean): string {
  if (!CLOUD_SYNC_FEATURE_ENABLED) return 'feature-off'
  const enabled = resolveCloudSyncEnabled(settingsFlag)
  if (!enabled) return 'off'
  return isCloudSyncActive() ? 'active' : 'pending'
}

/** Offset UTC local (ISO 8601), sin ID IANA — p. ej. `+02:00` o `Z`. */
export function formatUtcOffset(): string {
  const offsetMin = -new Date().getTimezoneOffset()
  if (offsetMin === 0) return 'Z'
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function captureFeedbackContext(openedFrom: FeedbackOpenFrom): FeedbackDiagnostics {
  const s = useStore.getState()
  const accountIdx = s.accounts.findIndex((a) => a.id === s.settings.activeAccountId)
  const slot = accountIdx >= 0 ? accountIdx + 1 : 1

  const viewport =
    typeof window !== 'undefined'
      ? `${window.innerWidth}×${window.innerHeight}@${window.devicePixelRatio ?? 1}`
      : 'unknown'

  const visibility = typeof document !== 'undefined' ? document.visibilityState : 'unknown'

  return {
    page: s.page,
    path: currentAppPath(s.page),
    locale: s.settings.locale ?? getAppLocale(),
    viewport,
    cloudSync: cloudSyncLabel(s.settings.cloudSyncEnabled),
    dbLocked: s.dbLocked,
    loadErrorPresent: !!s.loadError,
    tradeCount: s.trades.length,
    accountCount: s.accounts.length,
    activeAccountSlot: Math.min(Math.max(slot, 1), Math.max(s.accounts.length, 1)),
    currency: s.settings.currency,
    defaultMarket: s.settings.defaultMarket,
    tradeModalOpen: s.tradeModal.open,
    statsRange: s.statsRange,
    sidebarCollapsed: s.sidebarCollapsed,
    visibility,
    utcOffset: formatUtcOffset(),
    openedFrom,
  }
}
