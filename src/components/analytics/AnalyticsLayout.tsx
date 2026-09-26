import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { SectionLabel } from '@/components/analytics/SectionLabel'

export type SectionHead = { title: ReactNode; subtitle?: ReactNode }

/**
 * Layout de Analítica: Resumen → Dónde está el edge → Tiempo → Riesgo → Proceso.
 * Cada bloque conserva su atributo data-analytics-section.
 */
export function AnalyticsLayout({
  summaryLabel,
  hero,
  edgeLabel,
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
  summaryLabel?: SectionHead
  hero?: ReactNode
  edgeLabel?: SectionHead
  origin?: ReactNode
  category?: ReactNode
  timeLabel?: SectionHead
  timeWeekday?: ReactNode
  timeEntry?: ReactNode
  riskLabel?: SectionHead
  riskRDist?: ReactNode
  riskDrawdown?: ReactNode
  riskEdge?: ReactNode
  processLabel?: SectionHead
  process?: ReactNode
}) {
  let n = 0
  const head = (h: SectionHead | undefined, delay: string) =>
    h ? (
      <SectionLabel index={++n} subtitle={h.subtitle} className={clsx('animate-rise', delay)}>
        {h.title}
      </SectionLabel>
    ) : null

  return (
    <div className="page">
      <Section>
        {head(summaryLabel, 'delay-1')}
        <div data-analytics-section="hero">{hero}</div>
      </Section>

      {(origin != null || category != null) && (
        <Section>
          {head(edgeLabel, 'delay-2')}
          {origin != null && <div data-analytics-section="origin">{origin}</div>}
          {category != null && <div data-analytics-section="category">{category}</div>}
        </Section>
      )}

      {(timeWeekday || timeEntry) && (
        <Section>
          {head(timeLabel, 'delay-3')}
          <div data-analytics-section="time" className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5 items-stretch">
            {timeWeekday}
            {timeEntry}
          </div>
        </Section>
      )}

      {(riskRDist || riskDrawdown || riskEdge) && (
        <Section>
          {head(riskLabel, 'delay-4')}
          <div data-analytics-section="risk" className="flex flex-col gap-4 lg:gap-5">
            {(riskRDist || riskDrawdown) && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5 items-stretch">
                {riskRDist}
                {riskDrawdown}
              </div>
            )}
            {riskEdge}
          </div>
        </Section>
      )}

      {process != null && (
        <Section>
          {head(processLabel, 'delay-5')}
          <div data-analytics-section="process">{process}</div>
        </Section>
      )}
    </div>
  )
}

function Section({ children }: { children: ReactNode }) {
  return <section className="flex min-w-0 flex-col gap-3.5 lg:gap-4">{children}</section>
}
