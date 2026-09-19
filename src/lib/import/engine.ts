import type { BrokerId, BrokerParseContext, ImportEngineResult, NormalizedExecution, BrokerAdapter } from './types'
import { parseCsvText, rowsToObjects, findHeaderRowIndex } from './csvParse'
import { detectBroker, getAdapter } from './adapters'
import { createId } from './parse'
import { groupAllExecutionsIntoTrades, groupExecutionsIntoTrades } from './groupTrades'

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
      return { broker: 'OTHER', executions: [], errors: ['Archivo vacío.'], warnings: [], skippedRows: 0 }
    }

    if (texts.length === 1) return this.parseOne(texts[0], broker)

    const errors: string[] = []
    const warnings: string[] = []
    const executions: NormalizedExecution[] = []
    let skippedRows = 0
    let resolvedBroker: BrokerId = 'OTHER'

    texts.forEach((text, i) => {
      const part = this.parseOne(text, broker)
      if (part.broker !== 'OTHER') resolvedBroker = part.broker
      executions.push(...part.executions)
      errors.push(...part.errors.map((e) => (texts.length > 1 ? `[hoja ${i + 1}] ${e}` : e)))
      warnings.push(...part.warnings.map((w) => (texts.length > 1 ? `[hoja ${i + 1}] ${w}` : w)))
      skippedRows += part.skippedRows
    })

    if (!executions.length && errors.length) {
      return { broker: resolvedBroker, executions: [], errors, warnings, skippedRows }
    }

    return {
      broker: resolvedBroker,
      executions,
      errors,
      warnings:
        texts.length > 1
          ? [`${texts.length} hojas de posiciones procesadas (cerradas + abiertas).`, ...warnings]
          : warnings,
      skippedRows,
    }
  }

  /** Atajo: CSV(s) → executions → trades consolidados (FIFO). */
  importAndGroup(fileContent: ParseInput, broker: BrokerId | 'AUTO' | string) {
    const result = this.parse(fileContent, broker)
    const trades = groupAllExecutionsIntoTrades(result.executions, { idFactory: createId })
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
    try {
      executions = resolved.parse(dataRows, ctx)
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Error desconocido en el adaptador.')
      return { broker: resolved.id, executions: [], errors, warnings, skippedRows: dataRowCount }
    }

    executions = this.sanitize(executions, errors)

    const typedRows = dataRows.filter((r) => {
      const type = Object.entries(r).find(([k]) => /^type$|^tipo$|^side$/i.test(k.replace(/[^a-z]/gi, '')))
      return type && String(type[1]).trim() !== ''
    }).length
    const skippedRows = Math.max(0, dataRowCount - Math.max(typedRows, executions.length))
    if (executions.length === 0 && dataRowCount > 0) {
      warnings.push(`${dataRowCount} fila(s) omitidas por datos incompletos o no parseables.`)
    } else if (typedRows > 0 && executions.length === 0) {
      warnings.push(`${typedRows} fila(s) con Type no parseables.`)
    }

    return {
      broker: resolved.id,
      executions,
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
}

export { groupExecutionsIntoTrades, groupAllExecutionsIntoTrades } from './groupTrades'
export { BROKER_ADAPTERS, getAdapter, detectBroker } from './adapters'
