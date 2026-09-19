import type { Trade, Market, Direction, Emotion, JournalEntry } from '@/types'
import { EMOTIONS } from '@/types'
import { uid, dateKeyFromDate } from './format'

interface Instrument {
  symbol: string
  market: Market
  price: number
  tick: number
  multiplier: number
  qty: [number, number]
  vol: number // distancia relativa al stop por operación
  fee: number
  intQty?: boolean
}

const INSTRUMENTS: Instrument[] = [
  { symbol: 'NQ', market: 'Futuros', price: 19850, tick: 0.25, multiplier: 20, qty: [1, 2], vol: 0.0015, fee: 4.2, intQty: true },
  { symbol: 'ES', market: 'Futuros', price: 5620, tick: 0.25, multiplier: 50, qty: [1, 2], vol: 0.0012, fee: 4.2, intQty: true },
  { symbol: 'EURUSD', market: 'Forex', price: 1.0865, tick: 0.0001, multiplier: 100000, qty: [0.2, 1], vol: 0.0025, fee: 3.5 },
  { symbol: 'GBPUSD', market: 'Forex', price: 1.2712, tick: 0.0001, multiplier: 100000, qty: [0.2, 0.8], vol: 0.003, fee: 3.5 },
  { symbol: 'XAUUSD', market: 'Materias primas', price: 2385, tick: 0.1, multiplier: 100, qty: [0.1, 0.5], vol: 0.006, fee: 6 },
  { symbol: 'BTCUSD', market: 'Crypto', price: 64200, tick: 1, multiplier: 1, qty: [0.05, 0.3], vol: 0.02, fee: 8 },
  { symbol: 'AAPL', market: 'Acciones', price: 214, tick: 0.01, multiplier: 1, qty: [50, 200], vol: 0.012, fee: 1 },
  { symbol: 'TSLA', market: 'Acciones', price: 248, tick: 0.01, multiplier: 1, qty: [30, 120], vol: 0.025, fee: 1 },
  { symbol: 'NVDA', market: 'Acciones', price: 128, tick: 0.01, multiplier: 1, qty: [50, 150], vol: 0.02, fee: 1 },
]

const STRATEGIES = ['Breakout', 'Pullback', 'Reversión a la media', 'ORB', 'Supply & Demand', 'Tendencia']
const TAGS = ['A+', 'Apertura', 'Noticias', 'Contra tendencia', 'Sesión NY', 'Sesión Londres', 'Sobreoperado', 'Plan seguido']

const NOTES = [
  'Entrada limpia en la ruptura del rango de apertura. Gestión según plan.',
  'Entré tarde persiguiendo el precio. Debería haber esperado el retesteo.',
  'Setup A+ con confluencia de volumen y estructura. Salida parcial en 1R, resto en 2.5R.',
  'Cerré antes de tiempo por miedo. El precio llegó al objetivo 10 minutos después.',
  'Stop demasiado ajustado para la volatilidad de la sesión.',
  'Operación de venganza tras la pérdida anterior. Fuera de plan.',
  'Buena lectura del contexto macro. Paciencia recompensada.',
  'Ruido de noticias, no debería haber operado en ese momento.',
  'Ejecución perfecta. Esperé la confirmación y respeté el stop.',
  'Tamaño de posición demasiado grande para el nivel de convicción.',
]

// PRNG determinista (mulberry32) para que la demo sea reproducible
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(r: () => number) {
  const u = 1 - r()
  const v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const round = (v: number, tick: number) => {
  const dec = Math.max(0, Math.ceil(-Math.log10(tick)))
  return Number((Math.round(v / tick) * tick).toFixed(dec))
}

export function generateDemoTrades(count = 90, days = 120, seed = 42): Trade[] {
  const r = rng(seed)
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)]
  const now = new Date()
  const trades: Trade[] = []

  for (let i = 0; i < count; i++) {
    const inst = pick(INSTRUMENTS)
    const daysAgo = Math.floor(r() * days)
    const entry = new Date(now)
    entry.setDate(now.getDate() - daysAgo)
    // Solo días laborables
    const dow = entry.getDay()
    if (dow === 0) entry.setDate(entry.getDate() + 1)
    if (dow === 6) entry.setDate(entry.getDate() - 1)
    entry.setHours(9 + Math.floor(r() * 7), Math.floor(r() * 60), 0, 0)

    const holdMin = Math.max(5, Math.round(Math.abs(gauss(r)) * 90 + 15))
    const exit = new Date(entry.getTime() + holdMin * 60000)

    const direction: Direction = r() < 0.58 ? 'LONG' : 'SHORT'
    const drift = inst.price * (1 + gauss(r) * 0.03)
    const entryPrice = round(drift, inst.tick)
    const riskDist = drift * inst.vol * (0.6 + r() * 0.8)
    const stopLoss = round(direction === 'LONG' ? entryPrice - riskDist : entryPrice + riskDist, inst.tick)
    const targetR = 1.5 + r() * 1.5
    const takeProfit = round(direction === 'LONG' ? entryPrice + riskDist * targetR : entryPrice - riskDist * targetR, inst.tick)

    // Resultado en R con sesgo positivo (edge realista)
    const win = r() < 0.6
    let rMult: number
    if (win) rMult = 0.7 + r() * (targetR - 0.5)
    else {
      rMult = -(0.5 + r() * 0.7)
      if (r() < 0.15) rMult = -(1 + r() * 0.6) // slippage ocasional en pérdidas
    }
    if (r() < 0.04) rMult = 0 // breakeven

    const move = riskDist * rMult * (direction === 'LONG' ? 1 : -1)
    const exitPrice = round(entryPrice + move, inst.tick)
    const rawQty = inst.qty[0] + r() * (inst.qty[1] - inst.qty[0])
    const quantity = inst.intQty ? Math.round(rawQty) : Number(rawQty.toFixed(inst.qty[1] < 5 ? 2 : 0))
    const fees = Number((inst.fee * (inst.intQty ? quantity : 1) * (0.8 + r() * 0.4)).toFixed(2))

    const emotion: Emotion = rMult < -0.9 && r() < 0.5 ? pick(['Ansioso', 'FOMO', 'Venganza'] as const) : pick(EMOTIONS)
    const rating = Math.min(5, Math.max(1, Math.round(3 + (win ? 0.8 : -0.6) + gauss(r) * 0.9)))
    const nTags = Math.floor(r() * 3)
    const tags = Array.from({ length: nTags }, () => pick(TAGS)).filter((v, i, a) => a.indexOf(v) === i)

    const ts = exit.toISOString()
    trades.push({
      id: uid() + i.toString(36),
      symbol: inst.symbol,
      market: inst.market,
      direction,
      status: 'CLOSED',
      entryDate: entry.toISOString(),
      exitDate: ts,
      entryPrice,
      exitPrice,
      quantity,
      multiplier: inst.multiplier,
      fees,
      stopLoss,
      takeProfit,
      strategy: pick(STRATEGIES),
      tags,
      notes: r() < 0.7 ? pick(NOTES) : '',
      rating,
      emotion,
      createdAt: ts,
      updatedAt: ts,
    })
  }

  // Dos operaciones abiertas
  for (let i = 0; i < 2; i++) {
    const inst = pick(INSTRUMENTS)
    const entry = new Date(now.getTime() - (1 + r() * 4) * 3600000)
    const direction: Direction = r() < 0.5 ? 'LONG' : 'SHORT'
    const entryPrice = round(inst.price * (1 + gauss(r) * 0.01), inst.tick)
    const riskDist = inst.price * inst.vol
    trades.push({
      id: uid() + 'o' + i,
      symbol: inst.symbol,
      market: inst.market,
      direction,
      status: 'OPEN',
      entryDate: entry.toISOString(),
      entryPrice,
      quantity: inst.qty[0],
      multiplier: inst.multiplier,
      fees: inst.fee,
      stopLoss: round(direction === 'LONG' ? entryPrice - riskDist : entryPrice + riskDist, inst.tick),
      takeProfit: round(direction === 'LONG' ? entryPrice + riskDist * 2 : entryPrice - riskDist * 2, inst.tick),
      strategy: pick(STRATEGIES),
      tags: ['Plan seguido'],
      notes: 'Posición abierta. Gestionar según plan.',
      rating: 0,
      emotion: 'Disciplinado',
      createdAt: entry.toISOString(),
      updatedAt: entry.toISOString(),
    })
  }

  return trades
}

export function looksLikeDemoDesk(notes: { title: string }[]) {
  const demoTitles = new Set(['Sesión disciplinada', 'Sobreoperé por la tarde', 'Mejor semana del trimestre', 'Revisión semanal'])
  return notes.filter((n) => demoTitles.has(n.title)).length >= 3
}

export function generateDemoNotes(): JournalEntry[] {
  const now = new Date()
  const mk = (daysAgo: number, mood: number, title: string, content: string): JournalEntry => {
    const d = new Date(now)
    d.setDate(now.getDate() - daysAgo)
    return { id: uid(), date: dateKeyFromDate(d), mood, title, content, updatedAt: d.toISOString() }
  }
  return [
    mk(
      0,
      4,
      'Sesión disciplinada',
      'Respeté el plan en todas las entradas. Solo 3 operaciones, todas con setup válido. Objetivo de la semana: no operar los primeros 5 minutos tras la apertura.',
    ),
    mk(
      3,
      2,
      'Sobreoperé por la tarde',
      'Después de dos pérdidas seguidas intenté recuperar en la sesión de tarde. Error clásico. Regla nueva: si acumulo -2R en el día, cierro plataforma.',
    ),
    mk(
      7,
      5,
      'Mejor semana del trimestre',
      'La estrategia de Pullback está funcionando muy bien en NQ. Tamaño de posición constante. Revisar si merece la pena subir el riesgo por operación al 1.25%.',
    ),
    mk(
      12,
      3,
      'Revisión semanal',
      'Revisión de la semana. El principal problema sigue siendo cerrar ganadoras antes de tiempo. Practicar dejar correr la posición hasta el objetivo o el stop.',
    ),
  ]
}
