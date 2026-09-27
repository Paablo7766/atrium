import { useEffect, useMemo, type ReactNode } from 'react'
import { Check, Download, Loader2, Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui'
import { WhatsNewPrimaryButton } from '@/components/WhatsNewCard'
import { parseLocalizedChangelog } from '@/lib/changelog'
import {
  canDismissUpdateModal,
  isPrereleaseVersion,
  shouldShowUpdateModal,
  summarizeReleaseNotes,
  useDesktopUpdaterStatus,
} from '@/lib/desktopUpdater'
import { displayHighlights } from '@/lib/releaseStories'
import { useT } from '@/lib/useI18n'
import { flushPersist, useStore } from '@/store'

function UpdateDialog({
  title,
  subtitle,
  children,
  footer,
  onClose,
  closable,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
  closable: boolean
}) {
  const t = useT()

  useEffect(() => {
    if (!closable) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closable, onClose])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-5 sm:p-8" role="dialog" aria-modal aria-labelledby="update-title">
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
        style={{
          wordSpacing: '0.06em',
          boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset, 0 40px 80px -36px rgba(0,0,0,0.88)',
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px z-10"
          style={{ background: 'rgba(255,255,255,0.16)', boxShadow: '0 0 18px rgba(255,255,255,0.16)' }}
        />

        <header className="relative px-7 pt-6">
          {closable && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="absolute top-5 right-5 z-10 w-8 h-8 rounded-full border border-white/[0.1] bg-white/[0.04] text-text-2 hover:text-text hover:bg-white/[0.08] flex items-center justify-center transition-colors"
            >
              <X size={15} />
            </button>
          )}
          <h2
            id="update-title"
            className="pr-10 text-[24px] font-semibold tracking-[-0.028em] leading-[1.15] text-text"
          >
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2 text-[13.5px] leading-[1.55] text-muted text-pretty">{subtitle}</p>
          )}
        </header>

        <div className="px-7 pt-5 pb-6">
          {children}
          <div className="pt-6">{footer}</div>
        </div>
      </article>
    </div>
  )
}

export function UpdateAvailableModal() {
  const t = useT()
  const locale = useStore((s) => s.settings.locale ?? 'es')
  const status = useDesktopUpdaterStatus()
  const tutorialActive = useStore((s) => s.tutorialActive)
  const feedbackOpen = useStore((s) => s.feedbackOpen)
  const whatsNewVisible = useStore((s) => s.whatsNewVisible)
  const tradeModalOpen = useStore((s) => s.tradeModal.open)
  const toast = useStore((s) => s.toast)

  const open = shouldShowUpdateModal({
    supported: status.supported,
    offer: status.offer,
    state: status.state,
    tutorialActive,
    feedbackOpen,
    whatsNewVisible,
    tradeModalOpen,
  })

  const version = status.availableVersion ?? ''
  const currentVersion = status.currentVersion
  const release = useMemo(
    () => (version ? parseLocalizedChangelog(locale).find((item) => item.version === version) : undefined),
    [version, locale],
  )
  const highlights = useMemo(() => {
    if (release) return displayHighlights(release, locale).map((story) => story.title)
    return summarizeReleaseNotes(status.releaseNotes)
  }, [release, locale, status.releaseNotes])

  const downloading = status.state === 'downloading'
  const downloaded = status.state === 'downloaded'
  const restarting = status.state === 'restarting'
  const failed = status.state === 'error'
  const percent = status.downloadPercent ?? 0
  const closable = canDismissUpdateModal(status.state)
  const beta = Boolean(version && isPrereleaseVersion(version))
  const showFrom = Boolean(currentVersion && currentVersion !== version)

  useEffect(() => {
    if (!downloaded && !restarting) return
    flushPersist()
  }, [downloaded, restarting])

  const dismiss = () => {
    if (!closable) return
    void window.api?.updater?.dismiss()
  }

  const download = async () => {
    const result = await window.api?.updater?.download()
    if (result && !result.ok) toast(result.error || t('update.error'), 'error')
  }

  const restart = async () => {
    const result = await window.api?.updater?.installAndRestart()
    if (result && !result.ok) toast(result.error || t('update.error'), 'error')
  }

  const title = restarting ? t('update.restartingTitle') : downloaded ? t('update.ready') : t('update.title')
  const subtitle = version && !downloaded && !restarting ? t('update.subtitle', { n: version }) : undefined

  if (!open) return null

  return (
    <UpdateDialog
      title={title}
      subtitle={subtitle}
      onClose={dismiss}
      closable={closable}
      footer={
        restarting ? (
          <WhatsNewPrimaryButton disabled onClick={() => undefined}>
            <Loader2 size={14} className="animate-spin" />
            {t('update.restarting')}
          </WhatsNewPrimaryButton>
        ) : downloaded ? (
          <>
            <WhatsNewPrimaryButton autoFocus onClick={dismiss}>
              {t('update.ok')}
            </WhatsNewPrimaryButton>
            <button
              type="button"
              onClick={() => void restart()}
              className="mt-3 w-full text-center text-[12.5px] text-muted underline decoration-white/[0.15] underline-offset-4 hover:text-text hover:decoration-text transition-colors"
            >
              {t('update.restartNow')}
            </button>
          </>
        ) : downloading ? (
          <WhatsNewPrimaryButton disabled onClick={() => undefined}>
            {t('update.downloading', { n: String(percent) })}
          </WhatsNewPrimaryButton>
        ) : (
          <>
            <WhatsNewPrimaryButton autoFocus onClick={() => void download()}>
              <Download size={14} />
              {t('update.now')}
            </WhatsNewPrimaryButton>
            <button
              type="button"
              onClick={dismiss}
              className="mt-3 w-full text-center text-[12.5px] text-muted underline decoration-white/[0.15] underline-offset-4 hover:text-text hover:decoration-text transition-colors"
            >
              {t('update.later')}
            </button>
          </>
        )
      }
    >
      <div className="flex items-center gap-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-3.5">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.05] text-text"
          aria-hidden
        >
          {downloaded || restarting ? <Check size={17} strokeWidth={2.2} /> : <Sparkles size={17} strokeWidth={2.2} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold tracking-[-0.02em] text-text tabular-nums">{version}</span>
            {beta && <Badge tone="amber">{t('update.betaBadge')}</Badge>}
          </div>
          {showFrom && (
            <p className="mt-1.5 text-[12px] leading-none text-dim">{t('update.fromVersion', { n: currentVersion })}</p>
          )}
        </div>
      </div>

      {failed && <p className="mt-4 text-[13px] leading-relaxed text-loss">{status.error || t('update.error')}</p>}

      {downloaded || restarting ? (
        <p className="mt-5 text-[13.5px] leading-[1.65] text-text-2">{t('update.readyBody')}</p>
      ) : highlights.length ? (
        <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{t('update.whatsNewLabel')}</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-text-2/50" />
                <p className="text-[13.5px] leading-[1.6] text-text-2">{item}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-5 text-[13.5px] leading-[1.65] text-muted">{t('update.noNotes')}</p>
      )}

      {downloading && (
        <div className="mt-5">
          <div className="h-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-white/70 transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
    </UpdateDialog>
  )
}
