import { format, parseISO } from 'date-fns'
import { enUS, es } from 'date-fns/locale'
import type { AppLocale } from '@/types'

export type ChangelogRelease = {
  version: string
  date: string | null
  items: string[]
}

const HEADING_RE = /^##\s+(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = []
  let current: ChangelogRelease | null = null

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const heading = HEADING_RE.exec(line)
    if (heading) {
      current = { version: heading[1], date: heading[2] ?? null, items: [] }
      releases.push(current)
      continue
    }
    if (!current) continue
    const item = line.replace(/^[-*]\s+/, '').trim()
    if (item && (line.startsWith('- ') || line.startsWith('* '))) current.items.push(item)
  }

  return releases
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

/** Releases newer than `lastSeen` and up to `current`, newest first. */
export function unseenReleases(
  releases: ChangelogRelease[],
  lastSeen: string | null | undefined,
  current: string,
): ChangelogRelease[] {
  return releases.filter((release) => {
    if (compareSemver(release.version, current) > 0) return false
    if (!lastSeen) return release.version === current
    return compareSemver(release.version, lastSeen) > 0
  })
}

export function formatReleaseDate(isoDate: string, locale: AppLocale): string {
  const date = parseISO(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return format(date, locale === 'en' ? 'd MMMM yyyy' : "d 'de' MMMM 'de' yyyy", {
    locale: locale === 'en' ? enUS : es,
  })
}
