import { format, parseISO } from 'date-fns'
import { enUS, es } from 'date-fns/locale'
import type { AppLocale } from '@/types'
import changelogEs from '../../CHANGELOG.md?raw'
import changelogEn from '../../CHANGELOG.en.md?raw'

export type ChangelogRelease = {
  version: string
  date: string | null
  items: string[]
}

const HEADING_RE = /^##\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*(?:[—–-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/

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

export type ChangelogItemKind = 'new' | 'improve' | 'fix' | 'other'

const ITEM_TAG_RE =
  /^\[(nuevo|new|mejora|mejoras|improve|improved|improvement|improvements|correcci[oó]n|correccion|fix|fixed)\]\s*/i

function kindFromTag(tag: string): ChangelogItemKind {
  const key = tag.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  if (key === 'nuevo' || key === 'new') return 'new'
  if (key === 'mejora' || key === 'mejoras' || key === 'improve' || key === 'improved' || key === 'improvement' || key === 'improvements')
    return 'improve'
  return 'fix'
}

export function changelogMarkdown(locale: AppLocale): string {
  return locale === 'en' ? changelogEn : changelogEs
}

export function parseLocalizedChangelog(locale: AppLocale): ChangelogRelease[] {
  return parseChangelog(changelogMarkdown(locale))
}

/** Display text for a version in the user's locale; empty if unknown. */
export function localizedReleaseItems(version: string, locale: AppLocale): string[] {
  const release = parseLocalizedChangelog(locale).find((r) => r.version === version)
  if (!release) return []
  return release.items.map((raw) => parseChangelogItem(raw).text)
}

/** Display helper: optional `[Nuevo]` / `[Mejora]` / `[Fix]` prefix, or a leading keyword. */
export function parseChangelogItem(raw: string): { kind: ChangelogItemKind; text: string } {
  const tagged = ITEM_TAG_RE.exec(raw)
  if (tagged) {
    const text = raw.slice(tagged[0].length).trim()
    return { kind: kindFromTag(tagged[1]), text: text || raw }
  }
  if (/^(nuev[oa]s?|new)\b/i.test(raw)) return { kind: 'new', text: raw }
  if (/^(mejoras?|improved?)\b/i.test(raw)) return { kind: 'improve', text: raw }
  if (/^(correcciones?|correcci[oó]n|fix(ed|es)?)\b/i.test(raw)) return { kind: 'fix', text: raw }
  return { kind: 'other', text: raw }
}

export function releaseHighlights(release: ChangelogRelease, max = 2): string[] {
  const tagged = release.items.filter((item) => {
    const kind = parseChangelogItem(item).kind
    return kind === 'new' || kind === 'improve'
  })
  return (tagged.length ? tagged : release.items).slice(0, max)
}

function splitSemver(version: string): { core: [number, number, number]; pre: string[] | null } {
  const trimmed = version.trim()
  const dash = trimmed.indexOf('-')
  const corePart = dash === -1 ? trimmed : trimmed.slice(0, dash)
  const prePart = dash === -1 ? null : trimmed.slice(dash + 1)
  const [maj = 0, min = 0, pat = 0] = corePart.split('.').map((n) => Number.parseInt(n, 10) || 0)
  return { core: [maj, min, pat], pre: prePart ? prePart.split('.') : null }
}

export function compareSemver(a: string, b: string): number {
  const left = splitSemver(a)
  const right = splitSemver(b)
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i]
  }
  if (!left.pre && !right.pre) return 0
  if (!left.pre) return 1
  if (!right.pre) return -1
  const n = Math.max(left.pre.length, right.pre.length)
  for (let i = 0; i < n; i++) {
    const ai = left.pre[i]
    const bi = right.pre[i]
    if (ai === undefined) return -1
    if (bi === undefined) return 1
    const an = Number.parseInt(ai, 10)
    const bn = Number.parseInt(bi, 10)
    const aNum = Number.isFinite(an) && String(an) === ai
    const bNum = Number.isFinite(bn) && String(bn) === bi
    if (aNum && bNum && an !== bn) return an - bn
    if (aNum !== bNum) return aNum ? -1 : 1
    const cmp = ai.localeCompare(bi)
    if (cmp !== 0) return cmp
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
