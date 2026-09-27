import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sparkles, Wand2, Wrench, X } from 'lucide-react'
import { version as appVersion } from '../../package.json'
import {
  formatReleaseDate,
  parseChangelogItem,
  parseLocalizedChangelog,
  unseenReleases,
  type ChangelogItemKind,
  type ChangelogRelease,
} from '@/lib/changelog'
import { markAppVersionSeen, resolveLastSeenAppVersion } from '@/lib/whatsNewSeen'
import { useT } from '@/lib/useI18n'
import { useStore } from '@/store'
import type { MessageKey } from '@/lib/i18n'
import { clsx } from 'clsx'

/** First-open after an update: product card. Seen/unseen still uses unseenReleases. */

const KIND_ORDER: ChangelogItemKind[] = ['new', 'improve', 'fix', 'other']

const KIND_UI: Record<
  ChangelogItemKind,
  { icon: typeof Sparkles; label: MessageKey | null }
> = {
  new: { icon: Sparkles, label: 'whatsNew.kindNew' },
  improve: { icon: Wand2, label: 'whatsNew.kindImprove' },
  fix: { icon: Wrench, label: 'whatsNew.kindFix' },
  other: { icon: Sparkles, label: null },
}

function groupReleaseItems(release: ChangelogRelease) {
  const groups = KIND_ORDER.map((kind) => ({ kind, items: [] as string[] }))
  const byKind = Object.fromEntries(groups.map((g) => [g.kind, g.items])) as Record<ChangelogItemKind, string[]>
  for (const raw of release.items) {
    const parsed = parseChangelogItem(raw)
    byKind[parsed.kind].push(parsed.text)
  }
  return groups.filter((g) => g.items.length)
}

export function WhatsNewModal() {
  const t = useT()
  const locale = useStore((s) => s.settings.locale ?? 'es')
  const lastSeenSetting = useStore((s) => s.settings.lastSeenAppVersion)
  const tutorialActive = useStore((s) => s.tutorialActive)
  const feedbackOpen = useStore((s) => s.feedbackOpen)
  const manualOpen = useStore((s) => s.whatsNewOpen)
  const closeWhatsNew = useStore((s) => s.closeWhatsNew)
  const setWhatsNewVisible = useStore((s) => s.setWhatsNewVisible)
  const updateSettings = useStore((s) => s.updateSettings)
  const [autoOpen, setAutoOpen] = useState(false)
  const [unseen, setUnseen] = useState<ChangelogRelease[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const allReleases = useMemo(() => parseLocalizedChangelog(locale).filter((r) => r.items.length), [locale])

  useEffect(() => {
    if (tutorialActive || feedbackOpen) return
    const lastSeen = resolveLastSeenAppVersion(lastSeenSetting)
    if (lastSeen === appVersion) return
    const next = unseenReleases(allReleases, lastSeen, appVersion)
    if (!next.length) {
      markAppVersionSeen(appVersion)
      if (lastSeenSetting !== appVersion) updateSettings({ lastSeenAppVersion: appVersion })
      return
    }
    setUnseen(next)
    setAutoOpen(true)
  }, [tutorialActive, feedbackOpen, lastSeenSetting, updateSettings, allReleases])

  useEffect(() => {
    if (manualOpen) setShowHistory(true)
  }, [manualOpen])

  const open = autoOpen || manualOpen
  const browsingHistory = manualOpen || showHistory
  const releases = browsingHistory ? allReleases : unseen
  const latest = releases[0]
  const canShowHistory = !browsingHistory && allReleases.length > unseen.length

  useEffect(() => {
    const visible = open && Boolean(latest)
    setWhatsNewVisible(visible)
    return () => setWhatsNewVisible(false)
  }, [open, latest, setWhatsNewVisible])

  const dateLabel = useMemo(
    () => (latest?.date ? formatReleaseDate(latest.date, locale) : null),
    [latest?.date, locale],
  )

  const dismiss = useCallback(() => {
    setAutoOpen(false)
    setShowHistory(false)
    closeWhatsNew()
    markAppVersionSeen(appVersion)
    updateSettings({ lastSeenAppVersion: appVersion })
  }, [closeWhatsNew, updateSettings])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  if (!open || !latest) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 sm:p-8" role="dialog" aria-modal aria-labelledby="whats-new-title">
      <div className="absolute inset-0 bg-[#050506]/82 backdrop-blur-md animate-modal-veil" onClick={dismiss} />
      <div
        className="absolute inset-0 pointer-events-none animate-modal-veil"
        style={{ background: 'radial-gradient(720px 380px at 50% 108%, rgba(228,228,235,0.06), transparent 62%)' }}
      />

      <article
        className="relative w-full max-w-[400px] max-h-[92vh] flex flex-col overflow-hidden rounded-[28px] border border-border-2 bg-surface-2 animate-modal-rise"
        style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset, 0 40px 80px -36px rgba(0,0,0,0.88)' }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px z-10"
          style={{ background: 'rgba(255,255,255,0.16)', boxShadow: '0 0 18px rgba(255,255,255,0.16)' }}
        />

        <div className="relative h-[168px] shrink-0 overflow-hidden bg-surface-2">
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
            className="absolute left-1/2 top-[124px] -translate-x-1/2 w-[560px] h-[560px] rounded-full bg-surface-2"
            style={{
              boxShadow:
                '0 0 0 1px rgba(255,255,255,0.06), 0 -12px 50px rgba(235,235,245,0.38), 0 -3px 16px rgba(255,255,255,0.5), inset 0 28px 70px -34px rgba(235,235,245,0.34)',
            }}
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-[122px] -translate-x-1/2 w-[220px] h-[10px] rounded-full blur-[6px]"
            style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,0.7), transparent)' }}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(19,19,22,0.35) 55%, #131316 100%)' }}
          />

          <button
            type="button"
            onClick={dismiss}
            aria-label={t('common.close')}
            className="absolute top-3.5 right-3.5 z-10 w-8 h-8 rounded-full border border-white/[0.1] bg-white/[0.04] text-text-2 hover:text-text hover:bg-white/[0.08] flex items-center justify-center transition-colors"
          >
            <X size={15} />
          </button>

          <div className="absolute inset-x-0 top-[34px] flex justify-center">
            <span
              className="relative inline-flex items-center gap-2 h-8 pl-1.5 pr-3.5 rounded-full border border-white/[0.1] bg-white/[0.04] backdrop-blur-md overflow-hidden text-[12px] font-medium text-text-2"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 30px -14px rgba(0,0,0,0.9)' }}
            >
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.08] text-text">
                <Sparkles size={11} strokeWidth={2.2} />
              </span>
              {t('whatsNew.version', { n: latest.version })}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.14] to-transparent animate-sheen [animation-delay:2.2s]"
              />
            </span>
          </div>
        </div>

        <div className="relative z-10 px-7 pb-6 -mt-7 flex flex-col min-h-0 flex-1">
          <header className="text-center">
            <h2
              id="whats-new-title"
              className="text-[26px] font-semibold tracking-[-0.045em] leading-tight bg-clip-text text-transparent bg-[linear-gradient(180deg,#ffffff_30%,#c8c8cf_100%)]"
            >
              {browsingHistory ? t('whatsNew.historySubtitle') : t('whatsNew.heroTitle')}
            </h2>
            <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted">
              {browsingHistory ? t('whatsNew.historyLead') : t('whatsNew.heroLead', { n: latest.version })}
            </p>
            {dateLabel && (
              <time dateTime={latest.date ?? undefined} className="mt-3 block text-[12px] text-dim">
                {dateLabel}
              </time>
            )}
          </header>

          <div className="mt-5 overflow-y-auto min-h-0 flex-1 scroll-smooth space-y-5 pr-0.5">
            {releases.map((release, index) => (
              <ReleaseBlock
                key={release.version}
                release={release}
                showHeading={releases.length > 1}
                first={index === 0}
                date={release.date ? formatReleaseDate(release.date, locale) : null}
              />
            ))}
          </div>

          <div className="pt-5 shrink-0">
            <button
              type="button"
              autoFocus
              onClick={dismiss}
              className="w-full inline-flex items-center justify-center h-11 px-5 rounded-[11px] text-[13.5px] font-semibold text-bg bg-[linear-gradient(180deg,#ffffff_0%,#d4d4d8_100%)] shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(0,0,0,0.14),0_0_0_1px_rgba(255,255,255,0.14),0_12px_40px_-12px_rgba(255,255,255,0.45)] hover:brightness-[1.04] hover:shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(0,0,0,0.14),0_0_0_1px_rgba(255,255,255,0.22),0_16px_56px_-10px_rgba(255,255,255,0.6)] active:scale-[0.985] transition-[box-shadow,transform,filter] duration-300"
            >
              {t('whatsNew.ok')}
            </button>
            {canShowHistory && (
              <button
                type="button"
                onClick={() => setShowHistory(true)}
                className="mt-3 w-full text-center text-[12.5px] text-muted underline decoration-white/[0.15] underline-offset-4 hover:text-text hover:decoration-text transition-colors"
              >
                {t('whatsNew.history')}
              </button>
            )}
          </div>
        </div>
      </article>
    </div>
  )
}

function ReleaseBlock({
  release,
  showHeading,
  first,
  date,
}: {
  release: ChangelogRelease
  showHeading: boolean
  first: boolean
  date: string | null
}) {
  const t = useT()
  const groups = groupReleaseItems(release)

  return (
    <section className={clsx(!first && 'pt-4 border-t border-border')}>
      {showHeading && (
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <p className="text-[12px] font-semibold text-text-2">{t('whatsNew.version', { n: release.version })}</p>
          {date && <time className="text-[11px] text-dim">{date}</time>}
        </div>
      )}
      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const ui = KIND_UI[group.kind]
          const Icon = ui.icon
          return (
            <div key={group.kind}>
              {ui.label && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-lg border border-white/[0.1] bg-white/[0.04] flex items-center justify-center text-text-2">
                    <Icon size={12} />
                  </span>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{t(ui.label)}</p>
                </div>
              )}
              <ul className="flex flex-col gap-2">
                {group.items.map((text) => (
                  <li key={text} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-text-2">
                    <span className="mt-[9px] w-1 h-1 rounded-full bg-white/28 shrink-0" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
