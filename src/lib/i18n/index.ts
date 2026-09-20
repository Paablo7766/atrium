import { enUS, es } from 'date-fns/locale'
import type { Locale as DateLocale } from 'date-fns'
import type { AccountType, AppLocale, Direction, Emotion, Market } from '@/types'
import { DEFAULT_MISTAKES } from '@/types'
import { esDict, type MessageKey } from './es'

export type { AppLocale, MessageKey }
export type Vars = Record<string, string | number>
export { esDict }

export const LOCALES: { value: AppLocale; native: string; label: string }[] = [
  { value: 'es', native: 'Español', label: 'Spanish' },
  { value: 'en', native: 'English', label: 'Inglés' },
]

type Dict = Record<MessageKey, string>

let enDict: Dict | undefined
let enLoad: Promise<Dict> | undefined

function dictFor(locale: AppLocale): Dict {
  if (locale === 'en' && enDict) return enDict
  return esDict as Dict
}

/** Load the English dictionary (Spanish stays in the main bundle). Safe to call repeatedly. */
export function ensureLocale(locale: AppLocale): Promise<void> {
  if (locale !== 'en') return Promise.resolve()
  if (enDict) return Promise.resolve()
  enLoad ??= import('./en').then((m) => {
    enDict = m.enDict
    return m.enDict
  })
  return enLoad.then(() => undefined)
}

let current: AppLocale = 'es'

export function isAppLocale(v: unknown): v is AppLocale {
  return v === 'es' || v === 'en'
}

export function getAppLocale(): AppLocale {
  return current
}

export function setAppLocale(locale: AppLocale) {
  current = locale
  if (typeof document !== 'undefined') document.documentElement.lang = locale
  if (locale === 'en') void ensureLocale('en')
}

export function t(locale: AppLocale, key: MessageKey, vars?: Vars): string {
  let s = dictFor(locale)[key] ?? (esDict as Dict)[key] ?? key
  if (vars) {
    s = s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : String(vars[k])))
  }
  return s
}

export function intlTag(locale: AppLocale = current) {
  return locale === 'en' ? 'en-US' : 'es-ES'
}

export function dateFnsLocale(locale: AppLocale = current): DateLocale {
  return locale === 'en' ? enUS : es
}

export function marketLabel(locale: AppLocale, market: Market) {
  return t(locale, `market.${market}` as MessageKey)
}

export function marketBlurb(locale: AppLocale, market: Market) {
  return t(locale, `market.blurb.${market}` as MessageKey)
}

export function emotionLabel(locale: AppLocale, emotion: Emotion | '') {
  if (!emotion) return t(locale, 'emotion.none')
  return t(locale, `emotion.${emotion}` as MessageKey)
}

export function directionLabel(locale: AppLocale, direction: Direction) {
  if (direction === 'SHORT') return t(locale, 'dir.short')
  if (direction === 'LONG') return t(locale, 'dir.long')
  return t(locale, 'dir.none')
}

export function mistakeLabel(locale: AppLocale, mistake: string) {
  const key = `mistake.${mistake}` as MessageKey
  if (DEFAULT_MISTAKES.includes(mistake as (typeof DEFAULT_MISTAKES)[number]) && key in esDict) {
    return t(locale, key)
  }
  return mistake
}

export function displayGroupKey(locale: AppLocale, key: string) {
  if (key === 'Sin estrategia') return t(locale, 'common.noStrategy')
  if (key === 'Sin etiqueta') return t(locale, 'common.noTag')
  if (key === 'Sin setup') return t(locale, 'common.noSetup')
  if (key === 'Sin indicar') return t(locale, 'emotion.none')
  if (`market.${key}` in esDict) return marketLabel(locale, key as Market)
  if (`emotion.${key}` in esDict) return emotionLabel(locale, key as Emotion)
  return mistakeLabel(locale, key)
}

export function accountTypeLabel(locale: AppLocale, type: AccountType) {
  return t(locale, `acct.${type}` as MessageKey)
}

export function accountTypeHint(locale: AppLocale, type: AccountType) {
  return t(locale, `acct.${type}Hint` as MessageKey)
}

export function weekdayShort(locale: AppLocale, day: number) {
  return t(locale, `wd.${day}` as MessageKey)
}

export function rangeLabel(locale: AppLocale, range: '7d' | '30d' | '90d' | 'mtd' | 'ytd' | 'all') {
  return t(locale, `range.${range}` as MessageKey)
}

export function rangeHint(locale: AppLocale, range: '7d' | '30d' | '90d' | 'mtd' | 'ytd' | 'all') {
  return t(locale, `range.hint.${range}` as MessageKey)
}

export function rangeOptions(locale: AppLocale) {
  return (['7d', '30d', '90d', 'mtd', 'ytd', 'all'] as const).map((value) => ({
    value,
    label: rangeLabel(locale, value),
  }))
}
