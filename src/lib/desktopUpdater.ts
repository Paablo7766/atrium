import { useEffect, useState } from 'react'

export type DesktopUpdaterState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export type DesktopUpdaterStatus = {
  supported: boolean
  currentVersion: string
  allowPrerelease: boolean
  state: DesktopUpdaterState
  availableVersion: string | null
  releaseNotes: string | null
  error: string | null
  downloadPercent: number | null
  /** True when the in-app notice should be shown (not snoozed this session). */
  offer: boolean
}

export function emptyUpdaterStatus(currentVersion = ''): DesktopUpdaterStatus {
  return {
    supported: false,
    currentVersion,
    allowPrerelease: false,
    state: 'idle',
    availableVersion: null,
    releaseNotes: null,
    error: null,
    downloadPercent: null,
    offer: false,
  }
}

export function isPrereleaseVersion(version: string): boolean {
  return version.includes('-')
}

export function shouldNotifyForVersion(opts: {
  current: string
  candidate: string
  allowPrerelease: boolean
  compare: (a: string, b: string) => number
}): boolean {
  if (opts.compare(opts.candidate, opts.current) <= 0) return false
  if (!opts.allowPrerelease && isPrereleaseVersion(opts.candidate)) return false
  return true
}

export function computeUpdateOffer(opts: {
  state: DesktopUpdaterState
  availableVersion: string | null
  dismissedVersion: string | null
}): boolean {
  if (opts.state === 'downloading' || opts.state === 'downloaded') return true
  if (opts.state !== 'available' || !opts.availableVersion) return false
  return opts.availableVersion !== opts.dismissedVersion
}

export function summarizeReleaseNotes(raw: string | null | undefined, max = 6): string[] {
  if (!raw?.trim()) return []
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^#{1,6}\s/.test(line))

  const bullets = lines
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) =>
      line
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/\[[^\]]*\]\(([^)]+)\)/g, '$1')
        .trim(),
    )
    .filter(Boolean)

  const picked = (bullets.length ? bullets : lines).slice(0, max)
  return picked.map((line) => line.replace(/^\[.*?\]\s*/, '').trim()).filter(Boolean)
}

export function shouldShowUpdateModal(opts: {
  supported: boolean
  offer: boolean
  state: DesktopUpdaterState
  tutorialActive: boolean
  feedbackOpen: boolean
  whatsNewVisible: boolean
  tradeModalOpen?: boolean
}): boolean {
  if (!opts.supported || !opts.offer) return false
  if (opts.tutorialActive || opts.feedbackOpen || opts.whatsNewVisible || opts.tradeModalOpen) return false
  return opts.state === 'available' || opts.state === 'downloading' || opts.state === 'downloaded'
}

export function useDesktopUpdaterStatus(): DesktopUpdaterStatus {
  const [status, setStatus] = useState<DesktopUpdaterStatus>(() => emptyUpdaterStatus())

  useEffect(() => {
    const api = window.api?.updater
    if (!api) return
    void api.getStatus().then(setStatus)
    return api.onStatus(setStatus)
  }, [])

  return status
}
