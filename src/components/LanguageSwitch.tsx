import { clsx } from 'clsx'
import { LOCALES, type AppLocale } from '@/lib/i18n'

export function LanguageSwitch({
  value,
  onChange,
  size = 'md',
}: {
  value: AppLocale
  onChange: (locale: AppLocale) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className={clsx('inline-flex items-center gap-1 p-1 rounded-xl bg-surface-2 border border-border', size === 'sm' && 'p-0.5')}
      role="radiogroup"
      aria-label="Language"
    >
      {LOCALES.map((l) => {
        const on = l.value === value
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={`${l.native} / ${l.label}`}
            onClick={() => onChange(l.value)}
            className={clsx(
              'rounded-lg font-semibold transition-all',
              size === 'sm' ? 'h-7 px-2.5 text-[11px]' : 'h-9 px-3.5 text-[13px]',
              on ? 'bg-text text-black shadow-sm' : 'text-muted hover:text-text hover:bg-surface-3',
            )}
          >
            {l.native}
          </button>
        )
      })}
    </div>
  )
}
