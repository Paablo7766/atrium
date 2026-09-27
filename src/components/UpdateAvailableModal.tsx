import { useMemo } from 'react'
import { Download, FlaskConical, Sparkles } from 'lucide-react'
import { Badge, Button, Modal } from '@/components/ui'
import { localizedReleaseItems } from '@/lib/changelog'
import { isPrereleaseVersion, shouldShowUpdateModal, summarizeReleaseNotes, useDesktopUpdaterStatus } from '@/lib/desktopUpdater'
import { useT } from '@/lib/useI18n'
import { useStore } from '@/store'

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
  const notes = useMemo(() => {
    const fromChangelog = version ? localizedReleaseItems(version, locale) : []
    if (fromChangelog.length) return fromChangelog
    return summarizeReleaseNotes(status.releaseNotes)
  }, [version, locale, status.releaseNotes])
  const downloading = status.state === 'downloading'
  const downloaded = status.state === 'downloaded'
  const failed = status.state === 'error'
  const percent = status.downloadPercent ?? 0

  const dismiss = () => {
    void window.api?.updater?.dismiss()
  }

  const download = async () => {
    const result = await window.api?.updater?.download()
    if (result && !result.ok) toast(result.error || t('update.error'), 'error')
    else if (result?.ok) toast(t('update.ready'), 'success')
  }

  return (
    <Modal
      open={open}
      onClose={downloaded || downloading ? () => undefined : dismiss}
      title={downloaded ? t('update.ready') : t('update.title')}
      subtitle={version ? t('update.subtitle', { n: version }) : undefined}
      width="max-w-lg"
      glow="neutral"
      footer={
        downloaded ? (
          <Button variant="primary" autoFocus onClick={dismiss}>
            {t('update.ok')}
          </Button>
        ) : downloading ? (
          <Button variant="secondary" disabled>
            {t('update.downloading', { n: String(percent) })}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={dismiss}>
              {t('update.later')}
            </Button>
            <Button variant="primary" autoFocus onClick={() => void download()}>
              <Download size={14} />
              {t('update.now')}
            </Button>
          </>
        )
      }
    >
      <div className="mb-5 rounded-2xl border border-border bg-surface-3/55 px-4 py-4">
        <div className="flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-2xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center shrink-0"
            aria-hidden
          >
            <Sparkles size={20} />
          </div>
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            {version && (
              <Badge tone="green" dot>
                {version}
              </Badge>
            )}
            {isPrereleaseVersion(version) && <Badge tone="amber">{t('update.betaBadge')}</Badge>}
          </div>
        </div>
      </div>

      {failed && <p className="text-[13px] text-loss mb-4">{status.error || t('update.error')}</p>}

      {downloaded ? (
        <p className="text-[14px] leading-relaxed text-text-2">{t('update.readyBody')}</p>
      ) : notes.length ? (
        <ul className="flex flex-col gap-2">
          {notes.map((item) => (
            <li key={item} className="flex items-start gap-3 px-1 py-1">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              <p className="text-[14px] leading-relaxed text-text-2">{item}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] leading-relaxed text-muted">{t('update.noNotes')}</p>
      )}

      {downloading && (
        <div className="mt-5">
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {isPrereleaseVersion(version) && !downloaded && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-amber">
          <FlaskConical size={12} />
          {t('update.betaBadge')}
        </p>
      )}
    </Modal>
  )
}
