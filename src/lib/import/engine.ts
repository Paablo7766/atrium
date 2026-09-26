import type {
  BrokerId,
  BrokerParseContext,
  ImportEngineResult,
  NormalizedExecution,
  BrokerAdapter,
  ReadyTradeInput,
} from './types'
import { parseCsvText, rowsToObjects, findHeaderRowIndex } from './csvParse'
import { detectBroker, getAdapter } from './adapters'
import { createId } from './parse'
import { groupAllExecutionsIntoTrades, groupExecutionsIntoTrades } from './groupTrades'
import { assembleImportTrades } from './readyTrades'

export type { BrokerId, NormalizedExecution, ImportEngineResult }

export interface CSVImportEngineOptions {
  /** Si true y broker='AUTO', intenta detectar por cabeceras. */
  autoDetect?: boolean
  defaultBaseCurrency?: string
  defaultQuoteCurrency?: string
}

type ParseInput = string | string[] | ArrayBuffer

/**
 * Motor de importación multi-broker.
 *
 * Acepta un CSV, varios CSVs (p.ej. hojas Closed + Open de XTB) o ArrayBuffer texto.
 */
export class CSVImportEngine {
  constructor(private readonly options: CSVImportEngineOptions = {}) {}

  parse(fileContent: ParseInput, broker: BrokerId | 'AUTO' | string): ImportEngineResult {
    const texts = this.normalizeInputs(fileContent)
    if (!texts.length) {
      return {
        broker: 'OTHER',
        executions: [],
        readyTrades: [],
        errors: ['Archivo vacío.'],
        warnings: [],
        skippedRows: 0,
      }
    }

    if (texts.length === 1) return this.parseOne(texts[0], broker)

    const errors: string[] = []
    const warnings: string[] = []
    const executions: NormalizedExecution[] = []
    const readyTrades: ReadyTradeInput[] = []
    let skippedRows = 0
    let resolvedBroker: BrokerId = 'OTHER'

    texts.forEach((text, i) => {
      const part = this.parseOne(text, broker)
      if (part.broker !== 'OTHER') resolvedBroker = part.broker
      executions.push(...part.executions)
      readyTrades.push(...part.readyTrades)
      errors.push(...part.errors.map((e) => (texts.length > 1 ? `[hoja ${i + 1}] ${e}` : e)))
      warnings.push(...part.warnings.map((w) => (texts.length > 1 ? `[hoja ${i + 1}] ${w}` : w)))
      skippedRows += part.skippedRows
    })

    if (!executions.length && !readyTrades.length && errors.length) {
      return { broker: resolvedBroker, executions: [], readyTrades: [], errors, warnings, skippedRows }
    }

    return {
      broker: resolvedBroker,
      executions,
      readyTrades,
      errors,
      warnings:
        texts.length > 1
          ? [`${texts.length} hojas de posiciones procesadas (cerradas + abiertas).`, ...warnings]
          : warnings,
      skippedRows,
    }
  }

  /**
   * CSV(s) → fills FIFO + trades ya formados (READY_POSITIONS).
   * Closed y Open del mismo ticker no se mezclan en un libro FIFO.
   */
  importAndGroup(fileContent: ParseInput, broker: BrokerId | 'AUTO' | string) {
    const result = this.parse(fileContent, broker)
    const trades = assembleImportTrades(result.executions, result.readyTrades, { idFactory: createId })
    return { ...result, trades }
  }

  toTrades(executions: NormalizedExecution[]) {
    return groupAllExecutionsIntoTrades(executions, { idFactory: createId })
  }

  toTradesForTicker(executions: NormalizedExecution[], ticker: string) {
    const t = ticker.toUpperCase()
    return groupExecutionsIntoTrades(
      executions.filter((e) => e.ticker.toUpperCase() === t),
      { idFactory: createId },
    )
  }

  private normalizeInputs(fileContent: ParseInput): string[] {
    if (Array.isArray(fileContent)) return fileContent.map((t) => t.trim()).filter(Boolean)
    if (typeof fileContent !== 'string') {
      const decoded = new TextDecoder('utf-8').decode(fileContent).trim()
      return decoded ? [decoded] : []
    }
    return fileContent.trim() ? [fileContent] : []
  }

  private parseOne(text: string, broker: BrokerId | 'AUTO' | string): ImportEngineResult {
    const errors: string[] = []
    const warnings: string[] = []

    const matrix = parseCsvText(text)
    if (matrix.length < 2) {
      return {
        broker: 'OTHER',
        executions: [],
        readyTrades: [],
        errors: ['El CSV no tiene cabecera + filas de datos.'],
        warnings,
        skippedRows: 0,
      }
    }

    const headerIdx = findHeaderRowIndex(matrix)
    if (headerIdx > 0) {
      warnings.push(`Cabecera detectada en fila ${headerIdx + 1} (metadatos omitidos).`)
    }
    const headers = matrix[headerIdx] ?? matrix[0]
    const dataRows = rowsToObjects(matrix, headerIdx)
    const dataRowCount = dataRows.length

    let resolved: BrokerAdapter | undefined =
      typeof broker === 'string' && broker.toUpperCase() === 'AUTO'
        ? detectBroker(headers)
        : getAdapter(String(broker))

    if (!resolved && this.options.autoDetect !== false) {
      resolved = detectBroker(headers)
      if (resolved) warnings.push(`Broker auto-detectado: ${resolved.id}`)
    }

    if (!resolved) {
      return {
        broker: 'OTHER',
        executions: [],
        readyTrades: [],
        errors: [`No hay adaptador para broker "${broker}". Usa XTB, INTERACTIVE_BROKERS, DEGIRO, FOMO o AXIOM.`],
        warnings,
        skippedRows: dataRowCount,
      }
    }

    const ctx: BrokerParseContext = {
      broker: resolved.id,
      defaultBaseCurrency: this.options.defaultBaseCurrency,
      defaultQuoteCurrency: this.options.defaultQuoteCurrency,
      decimalSeparator: resolved.id === 'INTERACTIVE_BROKERS' ? '.' : ',',
    }

    let executions: NormalizedExecution[] = []
    let readyTrades: ReadyTradeInput[] = []
    try {
      const parsed = resolved.parse(dataRows, ctx)
      executions = parsed.executions
      readyTrades = parsed.readyTrades
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Error desconocido en el adaptador.')
      return { broker: resolved.id, executions: [], readyTrades: [], errors, warnings, skippedRows: dataRowCount }
    }

    executions = this.sanitize(executions, errors)
    readyTrades = this.sanitizeReady(readyTrades, errors)

    const accepted = executions.length + readyTrades.length
    const typedRows = dataRows.filter((r) => {
      const type = Object.entries(r).find(([k]) => /^type$|^tipo$|^side$/i.test(k.replace(/[^a-z]/gi, '')))
      return type && String(type[1]).trim() !== ''
    }).length
    const skippedRows = Math.max(0, dataRowCount - Math.max(typedRows, accepted))
    if (accepted === 0 && dataRowCount > 0) {
      warnings.push(`${dataRowCount} fila(s) omitidas por datos incompletos o no parseables.`)
    } else if (typedRows > 0 && accepted === 0) {
      warnings.push(`${typedRows} fila(s) con Type no parseables.`)
    }

    return {
      broker: resolved.id,
      executions,
      readyTrades,
      errors,
      warnings,
      skippedRows,
    }
  }

  private sanitize(executions: NormalizedExecution[], errors: string[]): NormalizedExecution[] {
    const out: NormalizedExecution[] = []
    executions.forEach((e, i) => {
      if (!e.ticker?.trim()) {
        errors.push(`Execution #${i + 1}: ticker vacío.`)
        return
      }
      if (!Number.isFinite(e.quantity) || e.quantity <= 0) {
        errors.push(`Execution #${i + 1} (${e.ticker}): quantity inválida.`)
        return
      }
      if (!Number.isFinite(e.price) || e.price < 0) {
        errors.push(`Execution #${i + 1} (${e.ticker}): price inválido.`)
        return
      }
      if (!e.executedAt || Number.isNaN(Date.parse(e.executedAt))) {
        errors.push(`Execution #${i + 1} (${e.ticker}): executedAt inválido.`)
        return
      }
      out.push({
        ...e,
        ticker: e.ticker.trim().toUpperCase(),
        quantity: Math.abs(e.quantity),
        fees: Number.isFinite(e.fees) ? Math.abs(e.fees) : 0,
        multiplier: e.multiplier > 0 && Number.isFinite(e.multiplier) ? e.multiplier : 1,
        baseCurrency: (e.baseCurrency || 'USD').toUpperCase().slice(0, 3),
        quoteCurrency: (e.quoteCurrency || 'USD').toUpperCase().slice(0, 3),
      })
    })
    return out
  }

  private sanitizeReady(trades: ReadyTradeInput[], errors: string[]): ReadyTradeInput[] {
    const out: ReadyTradeInput[] = []
    trades.forEach((t, i) => {
      if (!t.ticker?.trim()) {
        errors.push(`Ready trade #${i + 1}: ticker vacío.`)
        return
      }
      if (!Number.isFinite(t.avgEntryPrice) || t.avgEntryPrice < 0) {
        errors.push(`Ready trade #${i + 1} (${t.ticker}): precio de entrada inválido.`)
        return
      }
      if (!t.openedAt || Number.isNaN(Date.parse(t.openedAt))) {
        errors.push(`Ready trade #${i + 1} (${t.ticker}): openedAt inválido.`)
        return
      }
      if (t.status === 'CLOSED') {
        if (!Number.isFinite(t.quantityClosed) || t.quantityClosed <= 0) {
          errors.push(`Ready trade #${i + 1} (${t.ticker}): quantityClosed inválida.`)
          return
        }
        if (t.avgExitPrice == null || !Number.isFinite(t.avgExitPrice) || t.avgExitPrice < 0) {
          errors.push(`Ready trade #${i + 1} (${t.ticker}): precio de salida inválido.`)
          return
        }
        if (!t.closedAt || Number.isNaN(Date.parse(t.closedAt))) {
          errors.push(`Ready trade #${i + 1} (${t.ticker}): closedAt inválido.`)
          return
        }
      } else if (!Number.isFinite(t.quantity) || t.quantity <= 0) {
        errors.push(`Ready trade #${i + 1} (${t.ticker}): quantity inválida.`)
        return
      }
      out.push({
        ...t,
        ticker: t.ticker.trim().toUpperCase(),
        quantity: Math.abs(t.quantity),
        quantityClosed: Math.abs(t.quantityClosed),
        feesTotal: Number.isFinite(t.feesTotal) ? Math.abs(t.feesTotal) : 0,
        multiplier: t.multiplier > 0 && Number.isFinite(t.multiplier) ? t.multiplier : 1,
        baseCurrency: (t.baseCurrency || 'USD').toUpperCase().slice(0, 3),
        quoteCurrency: (t.quoteCurrency || 'USD').toUpperCase().slice(0, 3),
      })
    })
    return out
  }
}

export { groupExecutionsIntoTrades, groupAllExecutionsIntoTrades } from './groupTrades'
export { assembleImportTrades, finalizeReadyTrades } from './readyTrades'
export { BROKER_ADAPTERS, getAdapter, detectBroker } from './adapters'
