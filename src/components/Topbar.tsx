import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { capitalize } from '@/lib/format'
import { dateFnsLocale } from '@/lib/i18n'
import { useLocale } from '@/lib/useI18n'

export function Topbar({ title, subtitle }: { title?: ReactNode; subtitle?: ReactNode }) {
  const locale = useLocale()
  const today = capitalize(format(new Date(), 'EEE d MMM', { locale: dateFnsLocale(locale) }))
  return (
    <header className="relative h-8 shrink-0 flex items-center justify-between gap-4 px-6 border-b border-border/40">
      <div className="flex items-baseline gap-2.5 min-w-0">
        {title && <h1 className="text-[13px] font-medium tracking-tight text-text truncate">{title}</h1>}
        {title && subtitle && <span className="text-border-3">·</span>}
        {subtitle && <span className="text-[12px] text-muted truncate">{subtitle}</span>}
      </div>
      <span className="text-[11px] text-dim hidden xl:block num tracking-wide">{today}</span>
    </header>
  )
}
