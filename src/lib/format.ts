import { format, parseISO, isValid } from 'date-fns'
import type { Currency } from '@/types'
import { dateFnsLocale, getAppLocale, intlTag } from '@/lib/i18n'

export function fmtMoney(value: number, currency: Currency = 'USD', opts: { sign?: boolean; compact?: boolean; decimals?: number } = {}) {
  const { sign = false, compact = false, decimals } = opts
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const formatter = new Intl.NumberFormat(intlTag(), {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: compact && abs >= 1000 ? 'compact' : 'standard',
    minimumFractionDigits: decimals ?? (compact && abs >= 1000 ? 0 : abs >= 10000 ? 0 : 2),
    maximumFractionDigits: decimals ?? (compact && abs >= 1000 ? (abs >= 10000 ? 0 : 1) : abs >= 10000 ? 0 : 2),
  })
  const str = formatter.format(abs)
  if (value < 0) return `-${str}`
  if (sign && value > 0) return `+${str}`
  return str
}

export function fmtNum(value: number, decimals = 2, opts: { sign?: boolean } = {}) {
  if (!Number.isFinite(value)) return '—'
  const str = new Intl.NumberFormat(intlTag(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value))
  if (value < 0) return `-${str}`
  if (opts.sign && value > 0) return `+${str}`
  return str
}

export function fmtPrice(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const decimals = abs >= 1000 ? 2 : abs >= 10 ? 2 : abs >= 1 ? 4 : 5
  return new Intl.NumberFormat(intlTag(), { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value)
}

export function fmtPct(value: number, decimals = 1, opts: { sign?: boolean } = {}) {
  if (!Number.isFinite(value)) return '—'
  const str = `${fmtNum(Math.abs(value), decimals)}%`
  if (value < 0) return `-${str}`
  if (opts.sign && value > 0) return `+${str}`
  return str
}

export function fmtR(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : ''}${fmtNum(value, 2)}R`
}

export function fmtDate(iso: string | undefined, pattern?: string) {
  if (!iso) return '—'
  const d = parseISO(iso)
  if (!isValid(d)) return '—'
  const p = pattern ?? (getAppLocale() === 'en' ? 'MMM d, yyyy' : 'dd MMM yyyy')
  return format(d, p, { locale: dateFnsLocale() })
}

export function fmtDateTime(iso: string | undefined) {
  return fmtDate(iso, getAppLocale() === 'en' ? 'MMM d, yyyy · HH:mm' : 'dd MMM yyyy · HH:mm')
}

export function fmtDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d}d`
}

export function fmtStreak(n: number) {
  if (!n) return '—'
  return n > 0 ? `${n}W` : `${Math.abs(n)}L`
}

export function fmtPayoff(value: number) {
  if (value === Infinity) return '∞'
  if (!Number.isFinite(value) || value <= 0) return '—'
  return fmtNum(value, 2)
}

export function dateKeyFromDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayKey() {
  return dateKeyFromDate(new Date())
}

/** Calendar day in the user's local timezone — never UTC from the ISO prefix. */
export function toDateKey(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = parseISO(iso)
  if (!isValid(d)) return iso.slice(0, 10)
  return dateKeyFromDate(d)
}

export function toMonthKey(iso: string) {
  return toDateKey(iso).slice(0, 7)
}

export function toLocalInputValue(iso: string | undefined) {
  if (!iso) return ''
  const d = parseISO(iso)
  if (!isValid(d)) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInputValue(v: string): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return isValid(d) ? d.toISOString() : undefined
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
