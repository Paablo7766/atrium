import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, ChartTooltip, Empty } from '@/components/ui'
import { tradeR } from '@/lib/stats'
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
  height = 228,
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
    <Card title={title} subtitle={subtitle}>
      {total > 0 ? (
        <RHistogramChart data={buckets} height={height} />
      ) : (
        <Empty title={emptyTitle ?? 'Sin stops'} description={emptyHint} />
      )}
    </Card>
  )
}

export function RHistogramChart({ data, height = 228 }: { data: RBucket[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 4 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="#1a1a1f" />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={36}
          allowDecimals={false}
          tickFormatter={(v) => String(v)}
        />
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as RBucket
            return (
              <ChartTooltip
                label={p.label}
                rows={[{ name: 'Operaciones', value: p.n, color: p.negative ? RED : GREEN }]}
              />
            )
          }}
        />
        <Bar dataKey="n" radius={[6, 6, 0, 0]} maxBarSize={42} activeBar={false}>
          {data.map((d) => (
            <Cell
              key={d.key}
              fill={d.negative ? RED : GREEN}
              fillOpacity={d.n ? (d.negative ? 0.75 : 0.9) : 0.15}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
