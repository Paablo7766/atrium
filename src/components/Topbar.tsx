import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { capitalize } from '@/lib/format'
import { dateFnsLocale } from '@/lib/i18n'
import { useLocale } from '@/lib/useI18n'

export function Topbar({ title, subtitle }: { title?: ReactNode; subtitle?: ReactNode }) {
  const locale = useLocale()
  const pattern = locale === 'en' ? 'EEE d MMM' : 'EEE d MMM'
  const today = capitalize(format(new Date(), pattern, { locale: dateFnsLocale(locale) }))
  return (
    <header className="drag-region relative h-12 shrink-0 flex items-center justify-between gap-6 pl-8 pr-[148px] border-b border-border/70 bg-bg/40 backdrop-blur-md">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div className="no-drag flex items-baseline gap-2.5 min-w-0">
        {title && <h1 className="text-[13px] font-semibold tracking-tight text-text truncate">{title}</h1>}
        {title && subtitle && <span className="text-border-3">·</span>}
        {subtitle && <span className="text-[12px] text-muted truncate">{subtitle}</span>}
      </div>
      <span className="text-[11px] text-dim hidden xl:block num pointer-events-none tracking-wide">{today}</span>
    </header>
  )
}
