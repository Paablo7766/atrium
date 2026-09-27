import type { ReactNode } from 'react'
import { Download, MessageSquare, Sparkles, Wand2, Wrench, X } from 'lucide-react'
import { clsx } from 'clsx'
import { AssetLogo } from '@/components/AssetLogo'
import type { ChangelogItemKind, ChangelogRelease } from '@/lib/changelog'
import { displayHighlights, type ReleaseStory, type ReleaseVisualId } from '@/lib/releaseStories'
import type { MessageKey } from '@/lib/i18n'
import { useT } from '@/lib/useI18n'
import type { AppLocale } from '@/types'

const KIND_ORDER: ChangelogItemKind[] = ['new', 'improve', 'fix', 'other']

const KIND_UI: Record<ChangelogItemKind, { icon: typeof Sparkles; label: MessageKey | null }> = {
  new: { icon: Sparkles, label: 'whatsNew.kindNew' },
  improve: { icon: Wand2, label: 'whatsNew.kindImprove' },
  fix: { icon: Wrench, label: 'whatsNew.kindFix' },
  other: { icon: Sparkles, label: null },
}

export function WhatsNewCard({
  title,
  lead,
  versionLabel,
  dateLabel,
  children,
  footer,
  onClose,
  closable = true,
}: {
  title: string
  lead?: string
  versionLabel?: string
  dateLabel?: string | null
  children: ReactNode
  footer: ReactNode
  onClose: () => void
  closable?: boolean
}) {
  const t = useT()

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-5 sm:p-8" role="dialog" aria-modal aria-labelledby="whats-new-title">
      <div
        className="fixed inset-0 bg-[#050506]/82 backdrop-blur-md animate-modal-veil"
        onClick={closable ? onClose : undefined}
      />
      <div
        className="absolute inset-0 pointer-events-none animate-modal-veil"
        style={{ background: 'radial-gradient(720px 380px at 50% 108%, rgba(228,228,235,0.06), transparent 62%)' }}
      />

      <article
        className="relative w-full max-w-[420px] mx-auto my-[min(8vh,48px)] rounded-[28px] border border-border-2 bg-surface-2 animate-modal-rise"
        style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset, 0 40px 80px -36px rgba(0,0,0,0.88)' }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px z-10"
          style={{ background: 'rgba(255,255,255,0.16)', boxShadow: '0 0 18px rgba(255,255,255,0.16)' }}
        />

        <div className="relative h-[148px] shrink-0 overflow-hidden bg-surface-2">
          <div
            aria-hidden
            className="absolute left-1/2 top-[4px] -translate-x-1/2 w-[440px] h-[240px] rounded-full animate-horizon-pulse"
            style={{ background: 'radial-gradient(closest-side, rgba(228,228,235,0.22), rgba(228,228,235,0.07) 48%, transparent 78%)' }}
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-[42px] -translate-x-1/2 w-[280px] h-[80px] rounded-full blur-[20px]"
            style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,0.5), transparent)' }}
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-[108px] -translate-x-1/2 w-[560px] h-[560px] rounded-full bg-surface-2"
            style={{
              boxShadow:
                '0 0 0 1px rgba(255,255,255,0.06), 0 -12px 50px rgba(235,235,245,0.38), 0 -3px 16px rgba(255,255,255,0.5), inset 0 28px 70px -34px rgba(235,235,245,0.34)',
            }}
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-[106px] -translate-x-1/2 w-[220px] h-[10px] rounded-full blur-[6px]"
            style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,0.7), transparent)' }}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(19,19,22,0.35) 55%, #131316 100%)' }}
          />

          {closable && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="absolute top-3.5 right-3.5 z-10 w-8 h-8 rounded-full border border-white/[0.1] bg-white/[0.04] text-text-2 hover:text-text hover:bg-white/[0.08] flex items-center justify-center transition-colors"
            >
              <X size={15} />
            </button>
          )}

          {versionLabel && (
            <div className="absolute inset-x-0 top-[30px] flex justify-center">
              <span
                className="relative inline-flex items-center gap-2 h-8 pl-1.5 pr-3.5 rounded-full border border-white/[0.1] bg-white/[0.04] backdrop-blur-md overflow-hidden text-[12px] font-medium text-text-2"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 30px -14px rgba(0,0,0,0.9)' }}
              >
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.08] text-text">
                  <Sparkles size={11} strokeWidth={2.2} />
                </span>
                {versionLabel}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.14] to-transparent animate-sheen [animation-delay:2.2s]"
                />
              </span>
            </div>
          )}
        </div>

        <div className="relative z-10 px-7 pb-6 -mt-7">
          <header className="text-center">
            <h2
              id="whats-new-title"
              className="text-[26px] font-semibold tracking-[-0.03em] leading-tight bg-clip-text text-transparent bg-[linear-gradient(180deg,#ffffff_30%,#c8c8cf_100%)]"
            >
              {title}
            </h2>
            {lead && <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted text-pretty">{lead}</p>}
            {dateLabel && <p className="mt-3 text-[12px] text-dim">{dateLabel}</p>}
          </header>

          <div className="mt-5 space-y-5 pr-0.5">{children}</div>

          <div className="pt-5">{footer}</div>
        </div>
      </article>
    </div>
  )
}

export function ReleaseStoryList({
  releases,
  locale,
  showHeadings,
}: {
  releases: ChangelogRelease[]
  locale: AppLocale
  showHeadings: boolean
}) {
  const t = useT()

  return (
    <>
      {releases.map((release, index) => {
        const stories = displayHighlights(release, locale)
        const groups = KIND_ORDER.map((kind) => ({ kind, items: stories.filter((s) => s.kind === kind) })).filter(
          (g) => g.items.length,
        )

        return (
          <section key={release.version} className={clsx(index > 0 && 'pt-4 border-t border-border')}>
            {showHeadings && (
              <p className="text-[12px] font-semibold text-text-2 mb-3">{t('whatsNew.version', { n: release.version })}</p>
            )}
            <div className="flex flex-col gap-4">
              {groups.map((group) => {
                const ui = KIND_UI[group.kind]
                const Icon = ui.icon
                return (
                  <div key={group.kind}>
                    {ui.label && (
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="w-6 h-6 rounded-lg border border-white/[0.1] bg-white/[0.04] flex items-center justify-center text-text-2">
                          <Icon size={12} />
                        </span>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{t(ui.label)}</p>
                      </div>
                    )}
                    <ul className="flex flex-col gap-3">
                      {group.items.map((story) => (
                        <li key={story.title}>
                          <StoryBlock story={story} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </>
  )
}

function StoryBlock({ story }: { story: ReleaseStory }) {
  return (
    <article className="rounded-2xl border border-border bg-surface-3/40 overflow-hidden">
      {story.visual && <ReleaseVisual id={story.visual} />}
      <div className={clsx('px-3.5', story.visual ? 'pt-3 pb-3.5' : 'py-3')}>
        <p className="text-[13.5px] font-semibold leading-snug tracking-[-0.02em] text-text">{story.title}</p>
        {story.body && <p className="mt-1.5 text-[12.5px] leading-[1.55] text-muted">{story.body}</p>}
      </div>
    </article>
  )
}

function ReleaseVisual({ id }: { id: ReleaseVisualId }) {
  return (
    <div className="relative h-[132px] bg-[#0b0b0d] overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.06), transparent 58%)' }}
      />
      <div className="relative h-full px-3.5 py-3 flex items-center justify-center">
        {id === 'unlock' && <UnlockVisual />}
        {id === 'logos' && <LogosVisual />}
        {id === 'dashboard' && <DashboardVisual />}
        {id === 'calendar' && <CalendarVisual />}
        {id === 'feedback' && <FeedbackVisual />}
        {id === 'update' && <UpdateVisual />}
      </div>
    </div>
  )
}

function UpdateVisual() {
  return (
    <div className="w-full max-w-[280px] rounded-2xl border border-white/[0.08] bg-surface-2/90 px-4 py-3.5 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]">
      <div className="flex items-center gap-2 text-text-2">
        <Download size={12} />
        <p className="text-[11px] font-semibold">Actualizar ahora</p>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className="h-full w-full rounded-full bg-white/70" />
      </div>
      <p className="mt-2.5 text-[10px] text-dim text-center">Reiniciando Atrium…</p>
    </div>
  )
}

function UnlockVisual() {
  return (
    <div className="w-full max-w-[280px] rounded-2xl border border-white/[0.08] bg-surface-2/90 px-4 py-3.5 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-dim">Atrium</p>
      <p className="mt-1.5 text-[13px] font-semibold text-text">Buenos días</p>
      <div className="mt-3 h-8 rounded-xl border border-border-2 bg-surface-3 px-3 flex items-center gap-1.5">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-text-2/80" />
        ))}
      </div>
      <div className="mt-2.5 h-7 rounded-[9px] bg-[linear-gradient(180deg,#ffffff_0%,#d4d4d8_100%)]" />
    </div>
  )
}

function LogosVisual() {
  const rows = [
    { ticker: 'NVDA', name: 'NVIDIA', pnl: '+2.4%' },
    { ticker: 'AAPL', name: 'Apple', pnl: '+0.8%' },
    { ticker: 'EURUSD', name: 'EUR/USD', pnl: '−0.3%' },
  ]
  return (
    <div className="w-full max-w-[300px] rounded-2xl border border-white/[0.08] bg-surface-2/90 overflow-hidden shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]">
      {rows.map((row, i) => (
        <div
          key={row.ticker}
          className={clsx('flex items-center gap-2.5 px-3 py-2', i > 0 && 'border-t border-border')}
        >
          <AssetLogo ticker={row.ticker} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold font-mono leading-none">{row.ticker}</p>
            <p className="text-[10px] text-dim mt-1 leading-none">{row.name}</p>
          </div>
          <p className={clsx('text-[11px] font-semibold tabular-nums', row.pnl.startsWith('+') ? 'text-accent' : 'text-loss')}>
            {row.pnl}
          </p>
        </div>
      ))}
    </div>
  )
}

function DashboardVisual() {
  return (
    <div className="w-full grid grid-cols-2 gap-2 h-[108px]">
      <div className="rounded-xl border border-white/[0.08] bg-surface-2/90 px-2.5 py-2 flex flex-col">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-dim">Recientes</p>
        <div className="mt-2 space-y-1.5 flex-1">
          {['NVDA', 'TSLA', 'AMZN'].map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-accent/70" />
              <span className="text-[10px] font-semibold font-mono">{s}</span>
              <span className="ml-auto text-[10px] text-accent tabular-nums">+1.2</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.08] bg-surface-2/90 px-2.5 py-2 flex flex-col">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-dim">Estrategias</p>
        <div className="mt-2 space-y-2 flex-1">
          {[72, 54, 31].map((n, i) => (
            <div key={i} className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full rounded-full bg-white/35" style={{ width: `${n}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CalendarVisual() {
  const cells = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 0, 1, 0]
  return (
    <div className="w-[210px] rounded-2xl border border-white/[0.08] bg-surface-2/90 px-3 py-2.5 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[10px] font-semibold text-text-2">Septiembre</p>
        <p className="text-[10px] font-semibold text-accent">+4.2%</p>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((tone, i) => (
          <span
            key={i}
            className={clsx(
              'h-4 rounded-[4px]',
              tone === 0 && 'bg-surface-3',
              tone === 1 && 'bg-accent/35',
              tone === 2 && 'bg-loss/35',
            )}
          />
        ))}
      </div>
    </div>
  )
}

function FeedbackVisual() {
  return (
    <div className="w-full max-w-[280px] rounded-2xl border border-white/[0.08] bg-surface-2/90 px-3.5 py-3 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]">
      <div className="flex items-center gap-2 text-text-2">
        <MessageSquare size={12} />
        <p className="text-[11px] font-semibold">Sugerencia</p>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <div className="h-1.5 w-11/12 rounded-full bg-white/12" />
        <div className="h-1.5 w-8/12 rounded-full bg-white/8" />
        <div className="h-1.5 w-9/12 rounded-full bg-white/8" />
      </div>
    </div>
  )
}

export function WhatsNewPrimaryButton({
  children,
  onClick,
  disabled,
  autoFocus,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      disabled={disabled}
      onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[11px] text-[13.5px] font-semibold text-bg bg-[linear-gradient(180deg,#ffffff_0%,#d4d4d8_100%)] shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(0,0,0,0.14),0_0_0_1px_rgba(255,255,255,0.14),0_12px_40px_-12px_rgba(255,255,255,0.45)] hover:brightness-[1.04] hover:shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(0,0,0,0.14),0_0_0_1px_rgba(255,255,255,0.22),0_16px_56px_-10px_rgba(255,255,255,0.6)] active:scale-[0.985] disabled:opacity-50 disabled:pointer-events-none transition-[box-shadow,transform,filter] duration-300"
    >
      {children}
    </button>
  )
}
