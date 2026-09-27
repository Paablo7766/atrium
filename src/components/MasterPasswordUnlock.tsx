import { Welcome } from '@/components/Onboarding'
import { useStore } from '@/store'

/** Returning users land on the same hero as first-run, with unlock instead of setup CTAs. */
export function MasterPasswordUnlock() {
  const locale = useStore((s) => s.settings.locale ?? 'es')
  const updateSettings = useStore((s) => s.updateSettings)

  return (
    <Welcome
      mode="unlock"
      locale={locale}
      onLocale={(next) => updateSettings({ locale: next })}
    />
  )
}
