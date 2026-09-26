import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip, Empty } from '@/components/ui'
import { AnalyticsCard } from '@/components/analytics/primitives'
import { tradeR } from '@/lib/stats'
import { getAppLocale, t } from '@/lib/i18n'
import type { Trade } from '@/types'

const GREEN = '#4ade80'
const RED = '#f87171'
const AXIS = { fontSize: 11, fill: '#5b5b65', fontFamily: 'inherit' as const }

export interface RBucket {
  key: string
  label: string
  n: number
  negative: boolean
}

const BUCKETS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'lt-2', label: '<-2R', min: -Infinity, max: -2 },
  { key: '-2--1', label: '-2 a -1R', min: -2, max: -1 },
  { key: '-1-0', label: '-1 a 0R', min: -1, max: 0 },
  { key: '0-1', label: '0 a 1R', min: 0, max: 1 },
  { key: '1-2', label: '1 a 2R', min: 1, max: 2 },
  { key: 'gt-2', label: '>2R', min: 2, max: Infinity },
]

const TICK: Record<string, string> = {
  'lt-2': '<−2R',
  '-2--1': '−2…−1',
  '-1-0': '−1…0',
  '0-1': '0…1',
  '1-2': '1…2',
  'gt-2': '>2R',
}

function inBucket(r: number, min: number, max: number) {
  if (max === Infinity) return r >= min
  return r >= min && r < max
}

/** Distribuye trades cerrados en buckets de R-múltiple. */
export function buildRDistribution(trades: Trade[]): RBucket[] {
  const rs = trades.map(tradeR).filter((r): r is number => r !== null)
  return BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    n: rs.filter((r) => inBucket(r, b.min, b.max)).length,
    negative: b.max <= 0,
  }))
}

export function RDistribution({
  trades,
  data,
  title,
  subtitle,
  emptyTitle,
  emptyHint,
  height = 220,
}: {
  /** Si se pasa, se calcula el histograma desde los trades tipados. */
  trades?: Trade[]
  /** Alternativa: buckets ya agregados. */
  data?: RBucket[]
  title: string
  subtitle?: string
  emptyTitle?: string
  emptyHint?: string
  height?: number
}) {
  const buckets = data ?? (trades ? buildRDistribution(trades) : [])
  const total = buckets.reduce((a, b) => a + b.n, 0)

  return (
    <AnalyticsCard title={title} subtitle={subtitle} className="h-full" bodyClassName="flex flex-col justify-end">
      {total > 0 ? (
        <RHistogramChart data={buckets} height={height} />
      ) : (
        <div className="flex h-full min-h-[220px] items-center justify-center">
          <Empty title={emptyTitle ?? t(getAppLocale(), 'an.noStops')} description={emptyHint} />
        </div>
      )}
    </AnalyticsCard>
  )
}

export function RHistogramChart({ data, height = 220 }: { data: RBucket[]; height?: number }) {
  const total = data.reduce((a, b) => a + b.n, 0)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke="#1a1a1f" />
        <XAxis
          dataKey="key"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(k: string) => TICK[k] ?? k}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={32} allowDecimals={false} tickFormatter={(v) => String(v)} />
        <ReferenceLine y={0} stroke="#2a2a31" />
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as RBucket
            return (
              <ChartTooltip
                label={TICK[p.key] ?? p.label}
                rows={[
                  { name: t(getAppLocale(), 'chart.trades'), value: p.n, color: p.negative ? RED : GREEN },
                  { name: t(getAppLocale(), 'an.ofTotal'), value: `${total ? Math.round((p.n / total) * 100) : 0}%` },
                ]}
              />
            )
          }}
        />
        <Bar dataKey="n" radius={[6, 6, 6, 6]} maxBarSize={36} activeBar={false}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.negative ? RED : GREEN} fillOpacity={d.n ? 0.85 : 0.12} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
