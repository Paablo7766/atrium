import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function SectionLabel({
  children,
  subtitle,
  index,
  className,
}: {
  children: ReactNode
  subtitle?: ReactNode
  index?: number
  className?: string
}) {
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="flex items-center gap-3">
        {index !== undefined && <span className="num text-[10px] font-semibold text-dim/70">{String(index).padStart(2, '0')}</span>}
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{children}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-white/[0.07] to-transparent" />
      </div>
      {subtitle && <p className="mt-1.5 text-[12.5px] leading-snug text-dim">{subtitle}</p>}
    </div>
  )
}
