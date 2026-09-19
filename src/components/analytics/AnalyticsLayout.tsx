import type { ReactNode } from 'react'
import { SectionLabel } from '@/components/analytics/SectionLabel'

/**
 * Layout modular del dashboard Analytics.
 * Cada slot corresponde a un bloque del grid oscuro.
 */
export function AnalyticsLayout({
  hero,
  originLabel,
  origin,
  category,
  timeLabel,
  timeWeekday,
  timeEntry,
  riskLabel,
  riskRDist,
  riskDrawdown,
  riskEdge,
  processLabel,
  process,
}: {
  hero?: ReactNode
  originLabel?: ReactNode
  origin?: ReactNode
  category?: ReactNode
  timeLabel?: ReactNode
  timeWeekday?: ReactNode
  timeEntry?: ReactNode
  riskLabel?: ReactNode
  riskRDist?: ReactNode
  riskDrawdown?: ReactNode
  riskEdge?: ReactNode
  processLabel?: ReactNode
  process?: ReactNode
}) {
  return (
    <div className="page">
      {hero}

      {originLabel != null && <SectionLabel className="animate-rise delay-2">{originLabel}</SectionLabel>}
      {origin}

      {category}

      {timeLabel != null && <SectionLabel className="animate-rise delay-3">{timeLabel}</SectionLabel>}
      {timeWeekday}
      {timeEntry}

      {riskLabel != null && <SectionLabel className="animate-rise delay-4">{riskLabel}</SectionLabel>}
      {(riskRDist || riskDrawdown) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 animate-rise delay-4">
          {riskRDist}
          {riskDrawdown}
        </div>
      )}
      {riskEdge}

      {processLabel != null && <SectionLabel className="animate-rise delay-5">{processLabel}</SectionLabel>}
      {process}
    </div>
  )
}

/** Placeholder visual para bloques aún no extraídos a componente propio. */
export function AnalyticsSlot({
  title,
  children,
  className,
}: {
  title?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl bg-[#16161a] border border-gray-800 p-6 ${className ?? ''}`}>
      {title && (
        <h3 className="text-[13px] font-semibold tracking-tight text-text mb-4">{title}</h3>
      )}
      {children}
    </div>
  )
}
