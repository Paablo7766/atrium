import { useCallback, useEffect, useMemo, useState } from 'react'
import { version as appVersion } from '../../package.json'
import { formatReleaseDate, parseLocalizedChangelog, compareSemver } from '@/lib/changelog'
import { markAppVersionSeen, resolveLastSeenAppVersion } from '@/lib/whatsNewSeen'
import { useT } from '@/lib/useI18n'
import { useStore } from '@/store'
import { ReleaseStoryList, WhatsNewCard, WhatsNewPrimaryButton } from '@/components/WhatsNewCard'

export function WhatsNewModal() {
  const t = useT()
  const locale = useStore((s) => s.settings.locale ?? 'es')
  const loaded = useStore((s) => s.loaded)
  const lastSeenSetting = useStore((s) => s.settings.lastSeenAppVersion)
  const tutorialActive = useStore((s) => s.tutorialActive)
  const feedbackOpen = useStore((s) => s.feedbackOpen)
  const manualOpen = useStore((s) => s.whatsNewOpen)
  const closeWhatsNew = useStore((s) => s.closeWhatsNew)
  const setWhatsNewVisible = useStore((s) => s.setWhatsNewVisible)
  const updateSettings = useStore((s) => s.updateSettings)
  const [autoOpen, setAutoOpen] = useState(false)
  const [unseen, setUnseen] = useState<ReturnType<typeof parseLocalizedChangelog>>([])
  const [showHistory, setShowHistory] = useState(false)

  const allReleases = useMemo(() => parseLocalizedChangelog(locale).filter((r) => r.items.length), [locale])

  useEffect(() => {
    if (!loaded || tutorialActive || feedbackOpen) return
    const lastSeen = resolveLastSeenAppVersion(lastSeenSetting)
    if (lastSeen && compareSemver(appVersion, lastSeen) <= 0) return
    const currentRelease = allReleases.find((r) => r.version === appVersion)
    if (!currentRelease?.items.length) {
      markAppVersionSeen(appVersion)
      if (lastSeenSetting !== appVersion) updateSettings({ lastSeenAppVersion: appVersion })
      return
    }
    setUnseen([currentRelease])
    setAutoOpen(true)
  }, [loaded, tutorialActive, feedbackOpen, lastSeenSetting, updateSettings, allReleases])

  useEffect(() => {
    if (manualOpen) setShowHistory(true)
  }, [manualOpen])

  const open = autoOpen || manualOpen
  const browsingHistory = manualOpen || showHistory
  const releases = browsingHistory ? allReleases : unseen
  const latest = releases[0]
  const canShowHistory = !browsingHistory && allReleases.length > 1

  useEffect(() => {
    const visible = open && Boolean(latest)
    setWhatsNewVisible(visible)
    return () => setWhatsNewVisible(false)
  }, [open, latest, setWhatsNewVisible])

  const dateLabel = useMemo(
    () => (latest?.date && !browsingHistory ? formatReleaseDate(latest.date, locale) : null),
    [latest?.date, locale, browsingHistory],
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
    <WhatsNewCard
      title={browsingHistory ? t('whatsNew.historySubtitle') : t('whatsNew.heroTitle')}
      lead={browsingHistory ? t('whatsNew.historyLead') : t('whatsNew.heroLead')}
      versionLabel={t('whatsNew.version', { n: latest.version })}
      dateLabel={dateLabel}
      onClose={dismiss}
      footer={
        <>
          <WhatsNewPrimaryButton autoFocus onClick={dismiss}>
            {t('whatsNew.ok')}
          </WhatsNewPrimaryButton>
          {canShowHistory && (
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="mt-3 w-full text-center text-[12.5px] text-muted underline decoration-white/[0.15] underline-offset-4 hover:text-text hover:decoration-text transition-colors"
            >
              {t('whatsNew.history')}
            </button>
          )}
        </>
      }
    >
      <ReleaseStoryList releases={releases} locale={locale} showHeadings />
    </WhatsNewCard>
  )
}
