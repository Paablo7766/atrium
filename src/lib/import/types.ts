/**
 * Dominio del motor de importación / normalización.
 * Independiente del modelo UI `Trade` en `@/types` (diario local).
 */

export type BrokerId =
  | 'XTB'
  | 'INTERACTIVE_BROKERS'
  | 'DEGIRO'
  | 'FOMO'
  | 'AXIOM'
  | 'MANUAL'
  | 'OTHER'

export type ExecutionSide = 'BUY' | 'SELL'
export type TradeDirection = 'LONG' | 'SHORT'
export type TradeLifecycleStatus = 'OPEN' | 'CLOSED'
export type InstrumentType = 'STOCK' | 'CFD' | 'FOREX' | 'FUTURE' | 'OPTION' | 'CRYPTO' | 'OTHER'

/** Fill normalizado — contrato común de todos los adaptadores de broker. */
export interface NormalizedExecution {
  /** ID externo del broker (order/exec). Opcional si el CSV no lo trae. */
  externalId?: string
  broker: BrokerId
  ticker: string
  instrumentType: InstrumentType
  side: ExecutionSide
  /** Siempre > 0. El sentido lo da `side`. */
  quantity: number
  /** Precio unitario en divisa de cotización. */
  price: number
  fees: number
  /** Divisa del activo subyacente (p.ej. EUR en EURUSD, USD en AAPL). */
  baseCurrency: string
  /** Divisa en la que se cotiza / se realiza el P&L. */
  quoteCurrency: string
  /** Multiplicador de contrato (futuros/CFD). Default 1. */
  multiplier: number
  /** Instantánea ISO-8601 UTC. */
  executedAt: string
  /**
   * P&L neto reportado por el bróker para el cierre (p.ej. columna Profit/Loss de XTB).
   * Si está presente, el agrupador lo usa en lugar del P&L calculado por precios
   * (importante con FX conversion / stocks multi-divisa).
   */
  reportedNetPnl?: number
  /** Fila original para auditoría / re-mapeo. */
  raw?: Record<string, string>
}

export interface ConsolidatedTrade {
  id: string
  ticker: string
  instrumentType: InstrumentType
  direction: TradeDirection
  status: TradeLifecycleStatus
  /** Cantidad aún abierta. 0 si CLOSED. */
  quantity: number
  /** Cantidad ya cerrada (acumulada, incl. parciales). */
  quantityClosed: number
  avgEntryPrice: number
  avgExitPrice: number | null
  feesTotal: number
  /** P&L realizado neto de comisiones. null si aún no hay cierre. */
  netPnl: number | null
  baseCurrency: string
  quoteCurrency: string
  multiplier: number
  openedAt: string
  closedAt: string | null
  /** IDs / índices de executions que componen este trade. */
  executionKeys: string[]
}

export interface BrokerParseContext {
  broker: BrokerId
  /** Separador decimal forzado; si omitido se detecta. */
  decimalSeparator?: ',' | '.'
  defaultBaseCurrency?: string
  defaultQuoteCurrency?: string
  defaultInstrumentType?: InstrumentType
}

/**
 * Cómo consume el engine lo que emite el adaptador.
 *
 * - `FIFO_FILLS` — cada fila es una ejecución suelta (IB, DEGIRO, FOMO, AXIOM).
 *   El engine las agrupa con FIFO por ticker.
 * - `READY_POSITIONS` — el export ya trae operaciones formadas (XTB Closed/Open
 *   Positions; futuro MetaTrader deal/closed). Esas filas NO pasan por FIFO.
 *   Pueden quedar fills residuales (historial de ejecuciones sin close en la misma fila).
 */
export type AdapterOutputMode = 'FIFO_FILLS' | 'READY_POSITIONS'

/** Origen de un trade que el bróker ya entregó cerrado o abierto. */
export type ReadyTradeProvenance = 'BROKER_CLOSED_ROW' | 'BROKER_OPEN_ROW'

/**
 * Operación ya formada por el bróker. El engine la convierte 1:1 a
 * `ConsolidatedTrade` y no la mezcla con fills de otros orígenes.
 */
export interface ReadyTradeInput {
  provenance: ReadyTradeProvenance
  ticker: string
  instrumentType: InstrumentType
  direction: TradeDirection
  status: TradeLifecycleStatus
  quantity: number
  quantityClosed: number
  avgEntryPrice: number
  avgExitPrice: number | null
  feesTotal: number
  netPnl: number | null
  baseCurrency: string
  quoteCurrency: string
  multiplier: number
  openedAt: string
  closedAt: string | null
  externalId?: string
  raw?: Record<string, string>
}

export interface AdapterParseResult {
  /** Fills sueltos → `groupAllExecutionsIntoTrades`. */
  executions: NormalizedExecution[]
  /** Round-trips / abiertas ya formadas → `finalizeReadyTrades` (sin FIFO). */
  readyTrades: ReadyTradeInput[]
}

export interface BrokerAdapter {
  readonly id: BrokerId
  readonly outputMode: AdapterOutputMode
  /** true si el header parece de este broker (auto-detect). */
  matches(headers: string[]): boolean
  parse(rows: Record<string, string>[], ctx: BrokerParseContext): AdapterParseResult
}

export interface ImportEngineResult {
  broker: BrokerId
  executions: NormalizedExecution[]
  readyTrades: ReadyTradeInput[]
  errors: string[]
  warnings: string[]
  skippedRows: number
}

export interface GroupTradesOptions {
  /** Generador de IDs (por defecto crypto.randomUUID / fallback). */
  idFactory?: () => string
  /** Tolerancia para considerar flat (default 1e-8). */
  flatEpsilon?: number
}
