import { useEffect, useMemo, useState } from 'react'
import { Calendar } from 'lucide-react'
import { version as appVersion } from '../../package.json'
import changelogMd from '../../CHANGELOG.md?raw'
import { Button, Modal } from '@/components/ui'
import { formatReleaseDate, parseChangelog, unseenReleases, type ChangelogRelease } from '@/lib/changelog'
import { markAppVersionSeen, resolveLastSeenAppVersion } from '@/lib/whatsNewSeen'
import { useT } from '@/lib/useI18n'
import { useStore } from '@/store'

export function WhatsNewModal() {
  const t = useT()
  const locale = useStore((s) => s.settings.locale ?? 'es')
  const lastSeenSetting = useStore((s) => s.settings.lastSeenAppVersion)
  const tutorialActive = useStore((s) => s.tutorialActive)
  const feedbackOpen = useStore((s) => s.feedbackOpen)
  const updateSettings = useStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const [releases, setReleases] = useState<ChangelogRelease[]>([])

  useEffect(() => {
    if (tutorialActive || feedbackOpen) return
    const lastSeen = resolveLastSeenAppVersion(lastSeenSetting)
    if (lastSeen === appVersion) return
    const unseen = unseenReleases(parseChangelog(changelogMd), lastSeen, appVersion).filter((r) => r.items.length)
    if (!unseen.length) {
      markAppVersionSeen(appVersion)
      if (lastSeenSetting !== appVersion) updateSettings({ lastSeenAppVersion: appVersion })
      return
    }
    setReleases(unseen)
    setOpen(true)
  }, [tutorialActive, feedbackOpen, lastSeenSetting, updateSettings])

  const latest = releases[0]
  const dateLabel = useMemo(
    () => (latest?.date ? formatReleaseDate(latest.date, locale) : null),
    [latest?.date, locale],
  )

  const dismiss = () => {
    setOpen(false)
    markAppVersionSeen(appVersion)
    updateSettings({ lastSeenAppVersion: appVersion })
  }

  if (!latest) return null

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title={t('whatsNew.title')}
      subtitle={t('whatsNew.version', { n: latest.version })}
      width="max-w-md"
      glow="neutral"
      footer={
        <Button variant="primary" onClick={dismiss}>
          {t('whatsNew.ok')}
        </Button>
      }
    >
      {dateLabel && (
        <div className="inline-flex items-center gap-1.5 mb-4 h-7 px-2.5 rounded-lg bg-surface-3 border border-border-2 text-[12px] font-medium text-text-2">
          <Calendar size={12} className="text-accent" />
          <time dateTime={latest.date ?? undefined}>{dateLabel}</time>
        </div>
      )}
      <div className="flex flex-col gap-5">
        {releases.map((release) => (
          <section key={release.version}>
            {releases.length > 1 && (
              <p className="text-[12px] font-semibold text-muted mb-2">
                {t('whatsNew.version', { n: release.version })}
                {release.date ? ` · ${formatReleaseDate(release.date, locale)}` : ''}
              </p>
            )}
            <ul className="flex flex-col gap-2.5">
              {release.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-text-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
