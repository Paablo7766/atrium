import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, RefObject, TextareaHTMLAttributes } from 'react'
import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, Minus, X, Star } from 'lucide-react'
import { ACCOUNT_COLORS, type AccountColor, type Direction } from '@/types'
import { useT } from '@/lib/useI18n'

// ---------- Card ----------
export function Card({ className, children, title, subtitle, action, padded = true }: {
  className?: string
  children: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  padded?: boolean
}) {
  return (
    <section className={clsx('card card-hover flex flex-col relative overflow-hidden', className)}>
      {(title || action) && (
        <header className="relative flex items-start justify-between gap-4 px-6 pt-5 pb-3.5">
          <div className="min-w-0">
            {title && <h3 className="text-[13px] font-semibold tracking-tight text-text">{title}</h3>}
            {subtitle && <p className="text-[13px] text-muted mt-1 leading-snug">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 no-drag">{action}</div>}
        </header>
      )}
      <div className={clsx('flex-1 min-h-0 relative', padded && (title ? 'px-6 pb-6' : 'p-6'))}>{children}</div>
    </section>
  )
}

// ---------- Button ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40 active:scale-[0.98]'
  const variants: Record<Variant, string> = {
    primary: 'bg-accent text-black font-semibold hover:bg-[#5ce392]',
    secondary: 'bg-surface-3 text-text border border-border-2 hover:bg-surface-4 hover:border-border-3',
    outline: 'bg-transparent text-text-2 border border-border-2 hover:border-border-3 hover:text-text',
    ghost: 'bg-transparent text-muted hover:text-text hover:bg-surface-3',
    danger: 'bg-loss/10 text-loss border border-loss/20 hover:bg-loss/20',
  }
  const sizes: Record<Size, string> = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-9.5 px-4 text-sm',
    lg: 'h-11 px-5 text-sm',
    icon: 'h-9 w-9 p-0',
  }
  return (
    <button className={clsx(base, variants[variant], sizes[size], className)} {...rest}>
      {children}
    </button>
  )
}

// ---------- Badge ----------
type Tone = 'neutral' | 'green' | 'red' | 'amber' | 'violet' | 'sky'
export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-surface-3 text-text-2 border-border-2',
    green: 'bg-accent/10 text-accent border-accent/20',
    red: 'bg-loss/10 text-loss border-loss/20',
    amber: 'bg-amber/10 text-amber border-amber/20',
    violet: 'bg-violet/10 text-violet border-violet/20',
    sky: 'bg-sky/10 text-sky border-sky/20',
  }
  return (
    <span className={clsx('inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] font-semibold border tracking-wide', tones[tone], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function DirectionGlyph({ direction, size = 13 }: { direction: Direction; size?: number }) {
  const wrap = 'w-6 h-6 rounded-md flex items-center justify-center shrink-0'
  if (direction === 'SHORT') {
    return (
      <span className={clsx(wrap, 'bg-loss/10 text-loss')}>
        <ArrowDownRight size={size} />
      </span>
    )
  }
  if (direction === 'LONG') {
    return (
      <span className={clsx(wrap, 'bg-accent/10 text-accent')}>
        <ArrowUpRight size={size} />
      </span>
    )
  }
  return null
}

export function DirectionChip({ direction }: { direction: Direction }) {
  const t = useT()
  if (direction === 'NONE') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 h-5.5 rounded-md bg-surface-3 text-muted" title={t('dir.noneTitle')}>
        <Minus size={12} />
        —
      </span>
    )
  }
  const short = direction === 'SHORT'
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 h-5.5 rounded-md', short ? 'bg-loss/10 text-loss' : 'bg-accent/10 text-accent')}>
      {short ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
      {short ? t('dir.short') : t('dir.long')}
    </span>
  )
}

// ---------- Segmented ----------
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; count?: number }[]
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={clsx(
        'inline-flex items-stretch gap-0.5 rounded-xl bg-surface-2 border border-border',
        'p-[3px] box-border',
        size === 'sm' ? 'h-8' : 'h-9',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'relative inline-flex h-full min-h-0 items-center justify-center gap-1.5',
              'rounded-[9px] font-medium leading-none whitespace-nowrap select-none',
              'transition-[background-color,color,box-shadow] duration-150',
              size === 'sm' ? 'px-2.5 text-[12px]' : 'px-3.5 text-[13px]',
              active
                ? 'bg-text text-black shadow-[0_1px_2px_rgba(0,0,0,0.35)]'
                : 'text-muted hover:text-text hover:bg-surface-3/80',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={clsx(
                  'num text-[10px] leading-none px-1.5 py-0.5 rounded-md',
                  active ? 'bg-black/10 text-black' : 'bg-surface-4 text-muted',
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------- Form ----------
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <span className="text-[11px] font-medium text-muted tracking-wide">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-dim">{hint}</span>}
    </div>
  )
}

const COLOR_CHECK_ON_LIGHT: AccountColor[] = ['green', 'amber']

export function ColorSwatches({
  value,
  onChange,
  offset = '#080809',
}: {
  value: AccountColor
  onChange: (color: AccountColor) => void
  offset?: string
}) {
  return (
    <div className="flex items-center gap-2.5 no-drag" role="radiogroup" aria-label="Color">
      {ACCOUNT_COLORS.map((c) => {
        const on = value === c.value
        const checkDark = COLOR_CHECK_ON_LIGHT.includes(c.value)
        return (
          <button
            key={c.value}
            type="button"
            title={c.value}
            aria-label={c.value}
            aria-checked={on}
            role="radio"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onChange(c.value)
            }}
            className={clsx(
              'w-8 h-8 rounded-full flex items-center justify-center shrink-0 no-drag transition-transform',
              on ? 'scale-110' : 'hover:scale-105',
            )}
            style={{
              background: c.swatch,
              boxShadow: on ? `0 0 0 2px ${offset}, 0 0 0 4px ${c.swatch}` : undefined,
            }}
          >
            {on && <Check size={14} strokeWidth={3} className={checkDark ? 'text-black' : 'text-white'} />}
          </button>
        )
      })}
    </div>
  )
}

const inputCls =
  'w-full h-9.5 px-3 rounded-xl bg-surface-2 border border-border-2 text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/15 transition-all'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(({ className, mono, ...rest }, ref) => (
  <input ref={ref} className={clsx(inputCls, mono && 'mono', className)} {...rest} />
))
Input.displayName = 'Input'

export type SelectOption = { value: string; label: string; hint?: string }
export type SelectGroup = { label?: string; options: SelectOption[] }

export function menuRowClass(active: boolean) {
  return clsx(
    'w-full flex items-center gap-2 min-h-9 px-2.5 py-1.5 rounded-xl text-[13px] text-left transition-colors',
    active ? 'bg-surface-3 text-text' : 'text-muted hover:text-text hover:bg-surface-3/80',
  )
}

export function Menu({
  open,
  onClose,
  anchorRef,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
  className?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number } | null>(null)

  const place = () => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 6
    const spaceBelow = window.innerHeight - r.bottom - gap - 12
    const spaceAbove = r.top - gap - 12
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow
    const width = Math.max(r.width, 168)
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8)
    if (openUp) {
      setPos({ bottom: window.innerHeight - r.top + gap, left, width, maxH: Math.min(280, spaceAbove) })
    } else {
      setPos({ top: r.bottom + gap, left, width, maxH: Math.min(280, Math.max(160, spaceBelow)) })
    }
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    const onWin = () => place()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  if (!open || !pos) return null
  return createPortal(
    <div
      ref={panelRef}
      role="listbox"
      className={clsx(
        'fixed z-[200] rounded-2xl border border-border-2 bg-surface-2 p-1 overflow-y-auto animate-scale-in',
        className,
      )}
      style={{
        top: pos.top,
        bottom: pos.bottom,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxH,
        boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 28px 64px -28px rgba(0,0,0,0.88)',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

export function Select({
  value,
  onChange,
  options,
  groups,
  placeholder,
  className,
  size = 'md',
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options?: SelectOption[]
  groups?: SelectGroup[]
  placeholder?: string
  className?: string
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const lists = groups ?? [{ options: options ?? [] }]
  const all = lists.flatMap((g) => g.options)
  const selected = value === '' ? undefined : all.find((o) => o.value === value)
  const label = selected?.label ?? placeholder ?? t('common.select')
  const empty = !selected

  return (
    <div className={clsx('relative', size === 'sm' ? 'inline-flex' : 'w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex items-center gap-2 text-left transition-all min-w-0',
          size === 'sm'
            ? 'h-8 px-3 rounded-full bg-surface-3 text-[12px] font-semibold border-0 hover:text-text'
            : inputCls,
          empty ? 'text-muted' : 'text-text',
          open && (size === 'sm' ? 'text-text' : 'border-accent/50 ring-2 ring-accent/15'),
        )}
      >
        <span className="truncate flex-1">{label}</span>
        <ChevronDown size={size === 'sm' ? 12 : 14} className={clsx('shrink-0 text-dim transition-transform', open && 'rotate-180')} />
      </button>
      <Menu open={open} onClose={() => setOpen(false)} anchorRef={triggerRef}>
        {lists.map((g, i) => (
          <div key={g.label ?? i} className={i > 0 ? 'mt-1 pt-1 border-t border-border' : undefined}>
            {g.label && (
              <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">{g.label}</div>
            )}
            {g.options.map((o) => {
              const on = o.value === value
              return (
                <button
                  key={o.value || o.label}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className={menuRowClass(on)}
                >
                  <span className="truncate flex-1">{o.label}</span>
                  {o.hint && <span className="text-[11px] text-dim shrink-0">{o.hint}</span>}
                  {on && <Check size={14} className="text-accent shrink-0" />}
                </button>
              )
            })}
          </div>
        ))}
      </Menu>
    </div>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputCls, 'h-auto min-h-24 py-2.5 resize-y leading-relaxed', className)} {...rest} />
}

// ---------- Modal ----------
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  action,
  width = 'max-w-3xl',
  glow,
  className,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  action?: ReactNode
  width?: string
  glow?: 'gain' | 'loss' | 'neutral'
  className?: string
}) {
  const t = useT()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const glowColor = glow === 'gain' ? 'rgba(74,222,128,0.55)' : glow === 'loss' ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.16)'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 sm:p-8" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-[#050506]/80 backdrop-blur-md animate-modal-veil" onClick={onClose} />
      <div
        className="absolute inset-0 pointer-events-none animate-modal-veil"
        style={{ background: 'radial-gradient(720px 380px at 50% 108%, rgba(74,222,128,0.07), transparent 62%)' }}
      />
      <div
        className={clsx(
          'relative w-full flex flex-col max-h-[92vh] overflow-hidden rounded-[28px] border border-border-2 bg-surface-2 animate-modal-rise',
          width,
          className,
        )}
        style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset, 0 40px 80px -36px rgba(0,0,0,0.88)' }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px z-10 transition-[background,box-shadow] duration-500"
          style={{ background: glowColor, boxShadow: `0 0 18px ${glowColor}` }}
        />
        <header className="flex items-start justify-between gap-4 px-7 pt-6 pb-4">
          <div className="min-w-0">
            <h2 className="text-[22px] font-semibold tracking-[-0.035em] leading-tight">{title}</h2>
            {subtitle && <p className="text-[13px] text-muted mt-1.5 leading-relaxed truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            {action}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close')} className="rounded-full">
              <X size={16} />
            </Button>
          </div>
        </header>
        <div className="h-px bg-gradient-to-r from-transparent via-border-2 to-transparent" />
        <div className="px-7 py-6 overflow-y-auto flex-1 min-h-0 scroll-smooth">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 px-7 py-4 border-t border-border/80 bg-surface/55 backdrop-blur-sm">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

// ---------- Confirm ----------
export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
}) {
  const t = useT()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel ?? t('common.delete')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-2 leading-relaxed">{message}</p>
    </Modal>
  )
}

// ---------- Stars ----------
export function Stars({ value, onChange, size = 14 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(i === value ? 0 : i)}
          className={clsx('transition-colors', onChange && 'hover:scale-110', i <= value ? 'text-amber' : 'text-border-3')}
        >
          <Star size={size} fill={i <= value ? 'currentColor' : 'none'} strokeWidth={1.75} />
        </button>
      ))}
    </div>
  )
}

// ---------- Ring ----------
export function Ring({ value, size = 44, stroke = 4, color = 'var(--color-accent)', track = 'var(--color-surface-4)', children }: {
  value: number // 0..100
  size?: number
  stroke?: number
  color?: string
  track?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  )
}

// ---------- Empty ----------
export function Empty({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && <div className="w-12 h-12 rounded-2xl bg-surface-3 border border-border-2 flex items-center justify-center text-muted mb-4">{icon}</div>}
      <h4 className="text-sm font-semibold">{title}</h4>
      {description && <p className="text-xs text-muted mt-1 max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---------- Pnl text ----------
export function Pnl({ value, children, className, neutralZero = true }: { value: number; children: ReactNode; className?: string; neutralZero?: boolean }) {
  const tone = value > 0 ? 'text-accent' : value < 0 ? 'text-loss' : neutralZero ? 'text-muted' : 'text-text'
  return <span className={clsx('num', tone, className)}>{children}</span>
}

// ---------- Chart tooltip ----------
export function ChartTooltip({
  label,
  rows,
  variant = 'default',
  footer,
}: {
  label?: ReactNode
  rows: { name: ReactNode; value: ReactNode; color?: string; block?: boolean }[]
  variant?: 'default' | 'mint'
  footer?: { name: ReactNode; value: ReactNode }
}) {
  if (variant === 'mint') {
    const blocks = rows.filter((r) => r.block)
    return (
      <div className="rounded-[20px] bg-accent text-black px-4 py-3.5 min-w-[208px] shadow-[0_18px_50px_-12px_rgba(74,222,128,0.55)]">
        {label && <div className="text-[11px] font-semibold text-black/55 mb-2.5">{label}</div>}
        {blocks.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {blocks.map((r, i) => (
              <div key={i} className={clsx('rounded-lg px-2.5 py-2', i === 0 ? 'bg-black text-white' : 'bg-black/15')}>
                <div className="text-[10px] opacity-55 truncate">{r.name}</div>
                <div className="num text-sm font-semibold mt-0.5">{r.value}</div>
              </div>
            ))}
          </div>
        )}
        {footer && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-black/50">{footer.name}</div>
            <div className="num text-[26px] font-semibold tracking-tight leading-none mt-1">{footer.value}</div>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="glass border border-border-2 rounded-xl px-3 py-2.5 shadow-xl min-w-36">
      {label && <div className="text-[11px] text-muted mb-1.5">{label}</div>}
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-text-2">
              {r.color && <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />}
              {r.name}
            </span>
            <span className="num font-semibold">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Meter({
  label,
  valueLabel,
  pct,
  minLabel,
  maxLabel,
}: {
  label: string
  valueLabel?: ReactNode
  pct: number
  minLabel?: ReactNode
  maxLabel?: ReactNode
}) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div className="min-w-[168px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
        {valueLabel}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-surface-4 overflow-hidden">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${w}%` }} />
      </div>
      {(minLabel || maxLabel) && (
        <div className="flex justify-between mt-1.5 text-[10px] text-dim num">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  )
}

export function Trend({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className="text-dim text-[11px]">—</span>
  const up = value >= 0
  const abs = Math.abs(value).toFixed(1)
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-[11px] font-semibold num', up ? 'text-accent' : 'text-loss')}>
      {up ? '↗' : '↘'} {up ? '+' : '−'}
      {abs}%
    </span>
  )
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{children}</div>
}

export function Stat({
  label,
  value,
  hint,
  trend,
  boxed,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  trend?: number | null
  boxed?: boolean
}) {
  return (
    <div className={clsx('min-w-0', boxed && 'metric-tile')}>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
        {trend !== undefined && <Trend value={trend} />}
      </div>
      <div className="num text-[18px] font-semibold tracking-tight mt-2.5 text-text leading-none">{value}</div>
      {hint != null && hint !== '' && <div className="text-[12px] text-dim mt-1.5 leading-snug">{hint}</div>}
    </div>
  )
}

export function AccentCard({
  label,
  value,
  hint,
  tone = 'green',
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'green' | 'red' | 'violet' | 'amber' | 'sky'
}) {
  const bar: Record<'green' | 'red' | 'violet' | 'amber' | 'sky', string> = {
    green: 'bg-accent',
    red: 'bg-loss',
    violet: 'bg-violet',
    amber: 'bg-amber',
    sky: 'bg-sky',
  }
  const color: Record<'green' | 'red' | 'violet' | 'amber' | 'sky', string> = {
    green: 'text-accent',
    red: 'text-loss',
    violet: 'text-violet',
    amber: 'text-amber',
    sky: 'text-sky',
  }
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface px-4 pt-3.5 pb-4 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</div>
      <div className={clsx('num text-[28px] font-semibold tracking-tight leading-none mt-2', color[tone])}>{value}</div>
      {hint && <div className="text-[11px] text-dim mt-1.5">{hint}</div>}
      <div className={clsx('absolute inset-x-4 bottom-0 h-[2px] rounded-full', bar[tone])} />
    </div>
  )
}
