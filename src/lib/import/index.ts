/**
 * Motor de importación multi-broker + normalización Execution → Trade.
 *
 * Uso rápido:
 * ```ts
 * import { CSVImportEngine, groupExecutionsIntoTrades } from '@/lib/import'
 * const engine = new CSVImportEngine()
 * const { executions, trades, errors } = engine.importAndGroup(csvText, 'XTB')
 * ```
 */

export type {
  BrokerId,
  ExecutionSide,
  TradeDirection,
  TradeLifecycleStatus,
  InstrumentType,
  NormalizedExecution,
  ConsolidatedTrade,
  BrokerParseContext,
  BrokerAdapter,
  AdapterOutputMode,
  AdapterParseResult,
  ReadyTradeInput,
  ReadyTradeProvenance,
  ImportEngineResult,
  GroupTradesOptions,
} from './types'

export {
  parseLocaleNumber,
  parseBrokerDate,
  parseSide,
  safeDiv,
  weightedAverage,
  createId,
  excelSerialToIso,
} from './parse'

export { CSVImportEngine } from './engine'
export { groupExecutionsIntoTrades, groupAllExecutionsIntoTrades } from './groupTrades'
export { assembleImportTrades, finalizeReadyTrades, FIFO_FILL_ADAPTERS, READY_POSITION_ADAPTERS } from './readyTrades'
export {
  BROKER_ADAPTERS,
  getAdapter,
  detectBroker,
  xtbAdapter,
  interactiveBrokersAdapter,
  degiroAdapter,
  fomoAdapter,
  axiomAdapter,
} from './adapters'
export {
  mapConsolidatedTrade,
  mapConsolidatedTrades,
  toStoreTrade,
  toStoreTrades,
  marketFromInstrument,
  type MappedTrade,
  type TradeMapperOptions,
} from './tradeMapper'
export { useImportCSV, type ImportBroker, type ImportCSVResult, type UseImportCSVOptions } from './useImportCSV'
export {
  fileToCsvText,
  fileToCsvTexts,
  workbookArrayBufferToCsv,
  workbookArrayBufferToCsvParts,
  isSpreadsheetFileName,
  pickTradeSheetName,
  pickTradeSheetNames,
  BROKER_FILE_ACCEPT,
} from './spreadsheet'
