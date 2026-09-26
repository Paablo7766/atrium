import { Area, AreaChart, Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChartTooltip } from './ui'
import { fmtMoney, fmtDate } from '@/lib/format'
import { getAppLocale, t } from '@/lib/i18n'
import type { Currency } from '@/types'
import type { EquityPoint, FlowPoint } from '@/lib/stats'

const GREEN = '#4ade80'
const RED = '#f87171'
const GRAY = '#6b6b75'
const AXIS = { fontSize: 11, fill: '#5b5b65', fontFamily: 'inherit' }

export function FlowChart({ data, currency, height = 320 }: { data: FlowPoint[]; currency: Currency; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="flow-profit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity={0.42} />
            <stop offset="55%" stopColor={GREEN} stopOpacity={0.1} />
            <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="flow-loss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GRAY} stopOpacity={0.28} />
            <stop offset="100%" stopColor={GRAY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#1a1a1f" />
        <XAxis dataKey="dateKey" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => fmtDate(v, 'd MMM')} minTickGap={48} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={72} tickFormatter={(v) => fmtMoney(v, currency, { compact: true, decimals: 0 })} domain={[0, 'auto']} />
        <Tooltip
          cursor={{ stroke: '#3a3a44', strokeWidth: 1, strokeDasharray: '4 4' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as FlowPoint
            return (
              <ChartTooltip
                variant="mint"
                label={fmtDate(p.dateKey, "d 'de' MMMM")}
                rows={[
                  { name: t(getAppLocale(), 'chart.cumProfit'), value: fmtMoney(p.cumProfit, currency), block: true },
                  { name: t(getAppLocale(), 'chart.cumLoss'), value: fmtMoney(p.cumLoss, currency), block: true },
                  { name: 'P&L del día', value: fmtMoney(p.pnl, currency, { sign: true }), block: true },
                  { name: 'P&L acum.', value: fmtMoney(p.cumPnl, currency, { sign: true }), block: true },
                ]}
                footer={{ name: t(getAppLocale(), 'chart.accountEquity'), value: fmtMoney(p.equity, currency) }}
              />
            )
          }}
        />
        <Area type="monotone" dataKey="cumLoss" stroke={GRAY} strokeWidth={1.5} fill="url(#flow-loss)" dot={false} isAnimationActive />
        <Area
          type="monotone"
          dataKey="cumProfit"
          stroke={GREEN}
          strokeWidth={2.25}
          fill="url(#flow-profit)"
          dot={false}
          activeDot={{ r: 5, fill: GREEN, stroke: '#080809', strokeWidth: 2 }}
          isAnimationActive
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function EquityChart({ data, currency, mode = 'equity', height = 280 }: { data: EquityPoint[]; currency: Currency; mode?: 'equity' | 'cumPnl'; height?: number }) {
  const key = mode === 'equity' ? 'equity' : 'cumPnl'
  const last = data[data.length - 1]
  const positive = last ? last.cumPnl >= 0 : true
  const color = positive ? GREEN : RED
  const points = data.map((d, i) => ({ ...d, i }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`eq-${mode}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="60%" stopColor={color} stopOpacity={0.06} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="0" stroke="#1a1a1f" />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => fmtDate(v, 'd MMM')} minTickGap={48} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={72} tickFormatter={(v) => fmtMoney(v, currency, { compact: true, decimals: 0 })} domain={['auto', 'auto']} />
        {mode === 'cumPnl' && <ReferenceLine y={0} stroke="#2a2a31" />}
        <Tooltip
          cursor={{ stroke: '#35353e', strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as EquityPoint
            return (
              <ChartTooltip
                variant="mint"
                label={`${fmtDate(p.date, 'dd MMM yyyy')} · ${p.symbol}`}
                rows={[
                  { name: mode === 'equity' ? t(getAppLocale(), 'chart.accountEquity') : t(getAppLocale(), 'chart.accumulated'), value: fmtMoney(p[key], currency), block: true },
                  { name: p.kind === 'cash' ? p.symbol : t(getAppLocale(), 'chart.trade'), value: fmtMoney(p.pnl, currency, { sign: true }), block: true },
                ]}
                footer={{ name: 'P&L del periodo', value: fmtMoney(p.cumPnl, currency, { sign: true }) }}
              />
            )
          }}
        />
        <Area type="monotone" dataKey={key} stroke={color} strokeWidth={2} fill={`url(#eq-${mode})`} dot={false} activeDot={{ r: 4, fill: color, stroke: '#080809', strokeWidth: 2 }} isAnimationActive />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function DailyPnlChart({ data, currency, height = 220 }: { data: { date: string; pnl: number; count: number }[]; currency: Currency; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="#1a1a1f" />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => fmtDate(v, 'd MMM')} minTickGap={40} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={72} tickFormatter={(v) => fmtMoney(v, currency, { compact: true, decimals: 0 })} />
        <ReferenceLine y={0} stroke="#2a2a31" />
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as { date: string; pnl: number; count: number }
            return (
              <ChartTooltip
                variant="mint"
                label={fmtDate(p.date, 'EEEE d MMM')}
                rows={[
                  { name: t(getAppLocale(), 'chart.trades'), value: p.count, block: true },
                  { name: t(getAppLocale(), 'chart.avg'), value: fmtMoney(p.count ? p.pnl / p.count : 0, currency, { sign: true }), block: true },
                ]}
                footer={{ name: 'P&L del día', value: fmtMoney(p.pnl, currency, { sign: true }) }}
              />
            )
          }}
        />
        <Bar dataKey="pnl" radius={[6, 6, 6, 6]} maxBarSize={28} activeBar={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pnl >= 0 ? GREEN : RED} fillOpacity={d.pnl >= 0 ? 0.9 : 0.75} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DrawdownChart({ data, currency, height = 180 }: { data: EquityPoint[]; currency: Currency; height?: number }) {
  const points = data.map((d) => ({ ...d, underwater: d.drawdown }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="dd-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={RED} stopOpacity={0} />
            <stop offset="40%" stopColor={RED} stopOpacity={0.12} />
            <stop offset="100%" stopColor={RED} stopOpacity={0.38} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#1a1a1f" />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => fmtDate(v, 'd MMM')} minTickGap={48} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={72} tickFormatter={(v) => fmtMoney(v, currency, { compact: true, decimals: 0 })} domain={['auto', 0]} />
        <ReferenceLine y={0} stroke="#2a2a31" />
        <Tooltip
          cursor={{ stroke: '#35353e', strokeWidth: 1, strokeDasharray: '4 4' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as EquityPoint
            return (
              <ChartTooltip
                label={`${fmtDate(p.date, 'dd MMM yyyy')} · ${p.symbol}`}
                rows={[
                  { name: t(getAppLocale(), 'chart.drawdown'), value: fmtMoney(p.drawdown, currency), color: RED },
                  { name: 'Equity', value: fmtMoney(p.equity, currency) },
                ]}
              />
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="underwater"
          stroke={RED}
          strokeWidth={1.75}
          fill="url(#dd-fill)"
          dot={false}
          activeDot={{ r: 4, fill: RED, stroke: '#080809', strokeWidth: 2 }}
          isAnimationActive
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function Sparkline({ data, positive, height = 36 }: { data: number[]; positive: boolean; height?: number }) {
  const color = positive ? GREEN : RED
  const pts = data.map((v, i) => ({ i, v }))
  const id = `spark-${positive ? 'g' : 'r'}`
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: -2 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function CategoryBars({
  data,
  currency,
  height = 240,
  valueKey = 'pnl',
  labelFormatter,
  valueFormatter,
  valueName,
  showCount = true,
}: {
  data: { key: string; pnl: number; count?: number; winRate?: number }[]
  currency: Currency
  height?: number
  valueKey?: string
  labelFormatter?: (k: string) => string
  valueFormatter?: (v: number) => string
  valueName?: string
  showCount?: boolean
}) {
  const fmt = valueFormatter ?? ((v: number) => fmtMoney(v, currency, { sign: true }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="#1a1a1f" />
        <XAxis dataKey="key" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={labelFormatter} interval={0} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={72} tickFormatter={(v) => (valueFormatter ? valueFormatter(v) : fmtMoney(v, currency, { compact: true, decimals: 0 }))} />
        <ReferenceLine y={0} stroke="#2a2a31" />
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as { key: string; pnl: number; count?: number; winRate?: number }
            const v = (p as Record<string, unknown>)[valueKey] as number
            return (
              <ChartTooltip
                label={labelFormatter ? labelFormatter(p.key) : p.key}
                rows={[
                  { name: valueName ?? 'P&L', value: fmt(v), color: v >= 0 ? GREEN : RED },
                  ...(showCount && p.count !== undefined ? [{ name: t(getAppLocale(), 'chart.trades'), value: p.count }] : []),
                  ...(p.winRate !== undefined && (p.count ?? 0) > 0 ? [{ name: t(getAppLocale(), 'chart.winRate'), value: `${p.winRate.toFixed(0)}%` }] : []),
                ]}
              />
            )
          }}
        />
        <Bar dataKey={valueKey} radius={[6, 6, 6, 6]} maxBarSize={36} activeBar={false}>
          {data.map((d, i) => {
            const v = (d as Record<string, unknown>)[valueKey] as number
            return <Cell key={i} fill={v >= 0 ? GREEN : RED} fillOpacity={0.85} />
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
