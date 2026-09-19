import { useCallback } from 'react'
import { useStore } from '@/store'
import { t, type AppLocale, type MessageKey, type Vars } from '@/lib/i18n'

export function useLocale(): AppLocale {
  return useStore((s) => s.settings.locale ?? 'es')
}

export function useT() {
  const locale = useLocale()
  return useCallback((key: MessageKey, vars?: Vars) => t(locale, key, vars), [locale])
}
