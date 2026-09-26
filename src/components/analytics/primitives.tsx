import { clsx } from 'clsx'
import type { CSSProperties, ReactNode } from 'react'
import { Trend } from '@/components/ui'

export const SCROLL_X = 'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

type DataTone = 'green' | 'red' | 'amber' | 'sky' | 'muted'

const TONE_TEXT: Record<DataTone, string> = {
  green: 'text-accent',
  red: 'text-loss',
  amber: 'text-amber',
  sky: 'text-sky',
  muted: 'text-muted',
}

/** Tarjeta base de Analítica: mismo radio, borde, padding y cabecera en todos los bloques. */
export function AnalyticsCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
  delay,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  delay?: number
}) {
  return (
    <section
      className={clsx('card card-hover relative flex flex-col min-w-0 animate-section-rise', className)}
      style={delay ? ({ animationDelay: `${delay}ms` } as CSSProperties) : undefined}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-5 lg:px-6 lg:pt-6">
          <div className="min-w-0 flex-1 basis-56">
            {title && <h3 className="text-[13px] font-semibold tracking-tight text-text">{title}</h3>}
            {subtitle && <p className="mt-1 text-[12.5px] leading-snug text-muted">{subtitle}</p>}
          </div>
          {action && <div className={clsx('no-drag max-w-full shrink-0', SCROLL_X)}>{action}</div>}
        </header>
      )}
      <div className={clsx('relative flex-1 min-h-0', title || action ? 'px-5 pb-5 pt-4 lg:px-6 lg:pb-6' : 'p-5 lg:p-6', bodyClassName)}>
        {children}
      </div>
    </section>
  )
}

/** KPI compacto: label caps, valor num 18px, hint 12px. */
export function MetricTile({
  label,
  value,
  hint,
  trend,
  tone,
  hintTone,
  aside,
  className,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  trend?: number | null
  tone?: DataTone
  hintTone?: DataTone
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('metric-tile min-w-0 flex items-center justify-between gap-3', className)}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-muted sm:tracking-[0.14em]">{label}</span>
          {trend !== undefined && (
            <span className="shrink-0">
              <Trend value={trend} />
            </span>
          )}
        </div>
        <div
          className={clsx(
            'num mt-2.5 truncate text-[16px] font-semibold leading-none tracking-tight sm:text-[18px]',
            tone ? TONE_TEXT[tone] : 'text-text',
          )}
        >
          {value}
        </div>
        {hint != null && hint !== '' && (
          <div className={clsx('mt-1.5 truncate text-[12px] leading-snug', hintTone ? TONE_TEXT[hintTone] : 'text-dim')}>{hint}</div>
        )}
      </div>
      {aside && <div className="hidden shrink-0 sm:block">{aside}</div>}
    </div>
  )
}

/** Par label caps / valor num, mismo formato que el panel expandido de Operaciones. */
export function Detail({
  label,
  value,
  hint,
  tone,
  hintTone,
  size = 'md',
  title,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: DataTone
  hintTone?: DataTone
  size?: 'md' | 'lg'
  title?: string
}) {
  return (
    <div className="min-w-0" title={title}>
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div
        className={clsx(
          'num truncate font-semibold tracking-tight',
          size === 'lg' ? 'mt-2 text-[18px] leading-none' : 'mt-1.5 text-[13px]',
          tone ? TONE_TEXT[tone] : 'text-text',
        )}
      >
        {value}
      </div>
      {hint != null && hint !== '' && (
        <div className={clsx('mt-1.5 truncate text-[12px] leading-snug', hintTone ? TONE_TEXT[hintTone] : 'text-dim')}>{hint}</div>
      )}
    </div>
  )
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('text-[10px] font-semibold uppercase tracking-[0.16em] text-dim', className)}>{children}</div>
}

/** Barra fina de magnitud (4–5px) para filas de rendimiento. */
export function MagnitudeBar({ pct, positive, className }: { pct: number; positive: boolean; className?: string }) {
  return (
    <div className={clsx('h-[5px] overflow-hidden rounded-full bg-white/[0.05]', className)}>
      <div
        className={clsx('h-full rounded-full transition-[width] duration-700', positive ? 'bg-accent/85' : 'bg-loss/80')}
        style={{ width: `${pct > 0 ? Math.max(4, Math.min(100, pct)) : 0}%` }}
      />
    </div>
  )
}
