import type { Market } from '@/types'

export interface InstrumentPreset {
  symbol: string
  market: Market
  multiplier: number
  fees: number
  hint: string
}

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  { symbol: 'NQ', market: 'Futuros', multiplier: 20, fees: 4.2, hint: 'Nasdaq 100 · 20 $/pt' },
  { symbol: 'ES', market: 'Futuros', multiplier: 50, fees: 4.2, hint: 'S&P 500 · 50 $/pt' },
  { symbol: 'YM', market: 'Futuros', multiplier: 5, fees: 4.2, hint: 'Dow · 5 $/pt' },
  { symbol: 'RTY', market: 'Futuros', multiplier: 50, fees: 4.2, hint: 'Russell · 50 $/pt' },
  { symbol: 'CL', market: 'Futuros', multiplier: 1000, fees: 4.2, hint: 'Crudo · 1000 $/pt' },
  { symbol: 'GC', market: 'Futuros', multiplier: 100, fees: 4.2, hint: 'Oro · 100 $/pt' },
  { symbol: 'EURUSD', market: 'Forex', multiplier: 100000, fees: 0, hint: '1 lote = 100 000' },
  { symbol: 'GBPUSD', market: 'Forex', multiplier: 100000, fees: 0, hint: '1 lote = 100 000' },
  { symbol: 'XAUUSD', market: 'Materias primas', multiplier: 100, fees: 0, hint: 'Oro spot · 100 $/pt' },
  { symbol: 'BTCUSD', market: 'Crypto', multiplier: 1, fees: 5, hint: 'BTC spot' },
  { symbol: 'US100', market: 'Índices', multiplier: 1, fees: 2, hint: 'Nasdaq CFD' },
  { symbol: 'GER40', market: 'Índices', multiplier: 1, fees: 2, hint: 'DAX CFD' },
]

export function presetForSymbol(raw: string): InstrumentPreset | undefined {
  const s = raw.trim().toUpperCase()
  if (!s) return undefined
  return INSTRUMENT_PRESETS.find((p) => p.symbol === s)
}
