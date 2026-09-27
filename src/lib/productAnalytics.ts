import posthog from 'posthog-js'
import { version as appVersion } from '../../package.json'
import { isDesktop } from '@/lib/db/client'
import { feedbackPlatformLabel } from '@/lib/feedback'

const ANON_ID_STORAGE_KEY = 'atrium_analytics_id'
const SESSION_SENT_KEY = 'atrium_analytics_session_sent'

/** PostHog Cloud EU — override with VITE_POSTHOG_HOST if needed. */
export const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com'

let initialized = false

function posthogKey(): string {
  return (import.meta.env.VITE_POSTHOG_KEY ?? '').trim()
}

function posthogHost(): string {
  const fromEnv = (import.meta.env.VITE_POSTHOG_HOST ?? '').trim().replace(/\/$/, '')
  return fromEnv || DEFAULT_POSTHOG_HOST
}

export function isProductAnalyticsEnabled(): boolean {
  if (import.meta.env.DEV) return false
  return posthogKey().length > 0
}

function readOrCreateAnonymousId(): string {
  try {
    const existing = localStorage.getItem(ANON_ID_STORAGE_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(ANON_ID_STORAGE_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

function osFamily(): string | undefined {
  if (isDesktop() && window.api?.platform) return window.api.platform
  return undefined
}

function logPostHogFailure(context: string, err: unknown): void {
  console.error(`[productAnalytics] ${context}`, err)
}

/** Inicializa PostHog en producción cuando hay API key. No-op en dev o sin key. */
export function initProductAnalytics(): void {
  if (!isProductAnalyticsEnabled()) {
    if (import.meta.env.DEV) {
      console.debug('[productAnalytics] disabled (dev or missing VITE_POSTHOG_KEY)')
    }
    return
  }
  if (initialized) return

  const distinctId = readOrCreateAnonymousId()

  try {
    posthog.init(posthogKey(), {
      api_host: posthogHost(),
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      person_profiles: 'identified_only',
      persistence: 'localStorage',
      advanced_disable_feature_flags: true,
      bootstrap: {
        distinctID: distinctId,
      },
      on_request_error: (error) => {
        logPostHogFailure('PostHog request failed', error)
      },
    })
    initialized = true
  } catch (err) {
    logPostHogFailure('posthog.init failed', err)
  }
}

/** Un evento `app_session_start` por sesión de pestaña/ventana (sessionStorage). */
export function trackAppSessionStart(): void {
  if (!isProductAnalyticsEnabled()) return
  if (!initialized) initProductAnalytics()
  if (!initialized) return

  try {
    if (sessionStorage.getItem(SESSION_SENT_KEY) === '1') return
  } catch {
    /* sessionStorage unavailable — still attempt one capture this load */
  }

  const properties: Record<string, string> = {
    platform: feedbackPlatformLabel(),
    app_version: appVersion,
  }
  const os = osFamily()
  if (os) properties.os_family = os

  try {
    posthog.capture('app_session_start', properties)
  } catch (err) {
    logPostHogFailure('capture app_session_start failed', err)
    return
  }

  try {
    sessionStorage.setItem(SESSION_SENT_KEY, '1')
  } catch {
    /* ignore */
  }
}
