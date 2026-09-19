import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-3 -mb-1', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim">{children}</span>
      <span className="flex-1 h-px bg-border" />
    </div>
  )
}
