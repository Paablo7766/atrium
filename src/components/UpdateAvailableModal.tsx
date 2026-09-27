import { Download, Loader2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { ReleaseStoryList, WhatsNewCard, WhatsNewPrimaryButton } from '@/components/WhatsNewCard'
import { parseLocalizedChangelog } from '@/lib/changelog'
import {
  canDismissUpdateModal,
  isPrereleaseVersion,
  shouldShowUpdateModal,
  useDesktopUpdaterStatus,
} from '@/lib/desktopUpdater'
import { useT } from '@/lib/useI18n'
import { flushPersist, useStore } from '@/store'

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
  const release = useMemo(
    () => (version ? parseLocalizedChangelog(locale).find((item) => item.version === version) : undefined),
    [version, locale],
  )
  const releases = release ? [release] : []
  const downloading = status.state === 'downloading'
  const applying = status.state === 'downloaded' || status.state === 'restarting'
  const restarting = status.state === 'restarting'
  const failed = status.state === 'error'
  const percent = status.downloadPercent ?? 0
  const closable = canDismissUpdateModal(status.state)

  useEffect(() => {
    if (!applying) return
    flushPersist()
  }, [applying])

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

  const title = restarting ? t('update.restartingTitle') : applying ? t('update.ready') : t('update.title')
  const lead = applying
    ? t('update.readyBody')
    : version
      ? t('update.lead', { n: version })
      : undefined
  const versionLabel = version
    ? isPrereleaseVersion(version)
      ? `${t('whatsNew.version', { n: version })} · ${t('update.betaBadge')}`
      : t('whatsNew.version', { n: version })
    : undefined

  if (!open) return null

  return (
    <WhatsNewCard
      title={title}
      lead={lead}
      versionLabel={versionLabel}
      onClose={dismiss}
      closable={closable}
      footer={
        applying ? (
          <WhatsNewPrimaryButton autoFocus disabled={restarting} onClick={() => void restart()}>
            {restarting ? <Loader2 size={14} className="animate-spin" /> : null}
            {restarting ? t('update.restarting') : t('update.ok')}
          </WhatsNewPrimaryButton>
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
      {failed && <p className="text-[13px] text-loss">{status.error || t('update.error')}</p>}

      {!applying && releases.length ? (
        <ReleaseStoryList releases={releases} locale={locale} showHeadings={false} />
      ) : !applying && !releases.length ? (
        <p className="text-[13.5px] leading-relaxed text-muted">{t('update.noNotes')}</p>
      ) : null}

      {downloading && (
        <div className="mt-1">
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full bg-white/70 transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
    </WhatsNewCard>
  )
}
