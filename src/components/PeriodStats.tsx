import { Stat } from '@/components/ui'
import type { Stats } from '@/lib/stats'
import { fmtPayoff, fmtStreak } from '@/lib/format'
import { useT } from '@/lib/useI18n'

export function PeriodStats({ stats, boxed }: { stats: Stats; boxed?: boolean }) {
  const t = useT()

  return (
    <>
      <Stat boxed={boxed} label={t('stats.streak')} value={fmtStreak(stats.currentStreak)} />
      <Stat boxed={boxed} label={t('stats.payoff')} value={fmtPayoff(stats.payoffRatio)} />
    </>
  )
}
