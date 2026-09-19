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
      <div data-analytics-section="hero">{hero}</div>

      {originLabel != null && <SectionLabel className="animate-rise delay-2">{originLabel}</SectionLabel>}
      {origin != null && <div data-analytics-section="origin">{origin}</div>}

      {category != null && <div data-analytics-section="category">{category}</div>}

      {timeLabel != null && <SectionLabel className="animate-rise delay-3">{timeLabel}</SectionLabel>}
      {(timeWeekday || timeEntry) && (
        <div data-analytics-section="time">
          {timeWeekday}
          {timeEntry}
        </div>
      )}

      {riskLabel != null && <SectionLabel className="animate-rise delay-4">{riskLabel}</SectionLabel>}
      {(riskRDist || riskDrawdown || riskEdge) && (
        <div data-analytics-section="risk">
          {(riskRDist || riskDrawdown) && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 animate-rise delay-4">
              {riskRDist}
              {riskDrawdown}
            </div>
          )}
          {riskEdge}
        </div>
      )}

      {processLabel != null && <SectionLabel className="animate-rise delay-5">{processLabel}</SectionLabel>}
      {process != null && <div data-analytics-section="process">{process}</div>}
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
