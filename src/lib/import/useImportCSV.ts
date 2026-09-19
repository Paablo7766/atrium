import { useCallback, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { useStore } from '@/store'
import { dedupeTrades } from '@/lib/csv'
import { useT } from '@/lib/useI18n'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { syncImportToSupabase } from '@/lib/tradeSync'
import type { BrokerId, ImportEngineResult } from './types'
import type { MappedTrade } from './tradeMapper'
import { CSVImportEngine } from './engine'
import { mapConsolidatedTrades, toStoreTrades } from './tradeMapper'
import { BROKER_FILE_ACCEPT, fileToCsvTexts, isSpreadsheetFileName } from './spreadsheet'

export type ImportBroker = BrokerId | 'AUTO'

export interface UseImportCSVOptions {
  /** Tras un import OK, ir al Dashboard para ver gráficos. Default true. */
  navigateToDashboard?: boolean
  defaultBroker?: ImportBroker
}

export interface ImportCSVResult {
  ok: boolean
  broker: string
  imported: number
  skippedDuplicates: number
  skippedRows: number
  openPositions: number
  closedTrades: number
  errors: string[]
  warnings: string[]
  mapped: MappedTrade[]
  fileName?: string
}

export interface UseImportCSVReturn {
  busy: boolean
  lastResult: ImportCSVResult | null
  /** Input file oculto (útil en web si no hay diálogo Electron). */
  fileInputRef: RefObject<HTMLInputElement | null>
  /** Abre el file picker (Electron dialog o click en input oculto). */
  pickAndImport: (broker?: ImportBroker) => Promise<ImportCSVResult | null>
  /** Procesa un File del `<input type="file">`. */
  importFileBlob: (file: File, broker?: ImportBroker) => Promise<ImportCSVResult | null>
  /** Procesa texto CSV ya leído. */
  importCsvText: (content: string, broker?: ImportBroker, fileName?: string) => Promise<ImportCSVResult>
  /** Handler onChange para el input oculto. */
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>, broker?: ImportBroker) => void
}

function emptyFail(broker: string, errors: string[], fileName?: string): ImportCSVResult {
  return {
    ok: false,
    broker,
    imported: 0,
    skippedDuplicates: 0,
    skippedRows: 0,
    openPositions: 0,
    closedTrades: 0,
    errors,
    warnings: [],
    mapped: [],
    fileName,
  }
}

function spreadsheetErrorMessage(
  err: unknown,
  t: (key: 'import.emptyFile' | 'import.corruptSpreadsheet' | 'import.unexpected') => string,
): string {
  if (err instanceof Error && err.message === 'EMPTY_SPREADSHEET') return t('import.emptyFile')
  if (err instanceof Error) {
    if (/corrupt|password|unsupported|invalid|Cannot read/i.test(err.message)) {
      return t('import.corruptSpreadsheet')
    }
    // Mensajes internos de SheetJS → toast amigable
    if (/xlsx|sheet|workbook|cfb|ole/i.test(err.message)) {
      return t('import.corruptSpreadsheet')
    }
    return err.message || t('import.unexpected')
  }
  return t('import.unexpected')
}

/** File picker nativo del renderer (soporta .xlsx binario; evita leer Excel como utf-8). */
function pickBrokerFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = BROKER_FILE_ACCEPT
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

/**
 * Encapsula: File (CSV|XLSX) → CSV texto → CSVImportEngine → group → TradeMapper → store (+ toasts).
 */
export function useImportCSV(options: UseImportCSVOptions = {}): UseImportCSVReturn {
  const navigateToDashboard = options.navigateToDashboard !== false
  const defaultBroker = options.defaultBroker ?? 'AUTO'

  const t = useT()
  const toast = useStore((s) => s.toast)
  const importData = useStore((s) => s.importData)
  const setPage = useStore((s) => s.setPage)
  const existingTrades = useStore((s) => s.trades)
  const settings = useStore((s) => s.settings)

  const [busy, setBusy] = useState(false)
  const [lastResult, setLastResult] = useState<ImportCSVResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingBrokerRef = useRef<ImportBroker>(defaultBroker)

  const runImport = useCallback(
    async (content: string | string[], broker: ImportBroker, fileName?: string): Promise<ImportCSVResult> => {
      const engine = new CSVImportEngine({
        autoDetect: true,
        defaultQuoteCurrency: settings.currency,
      })

      let engineResult: ImportEngineResult & { trades?: ReturnType<CSVImportEngine['toTrades']> }
      try {
        engineResult = engine.importAndGroup(content, broker)
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('import.unexpected')
        const fail = emptyFail(String(broker), [msg], fileName)
        setLastResult(fail)
        toast(msg, 'error')
        return fail
      }

      const { executions, trades: consolidated, errors, warnings, skippedRows, broker: resolvedBroker } =
        engineResult as ImportEngineResult & { trades: ReturnType<CSVImportEngine['toTrades']> }

      if (errors.length && !executions.length) {
        const msg = errors[0] ?? t('import.invalidFormat')
        const fail = emptyFail(resolvedBroker, errors, fileName)
        fail.warnings = warnings
        fail.skippedRows = skippedRows
        setLastResult(fail)
        toast(
          broker !== 'AUTO' && /no hay adaptador|no adapter/i.test(msg)
            ? t('import.brokerMismatch', { broker: String(broker) })
            : msg,
          'error',
        )
        return fail
      }

      if (!executions.length) {
        const fail = emptyFail(resolvedBroker, [t('import.noExecutions')], fileName)
        fail.warnings = warnings
        fail.skippedRows = skippedRows
        setLastResult(fail)
        toast(t('import.noExecutions'), 'error')
        return fail
      }

      if (!consolidated.length) {
        const fail = emptyFail(resolvedBroker, [t('import.noTrades')], fileName)
        fail.warnings = warnings
        setLastResult(fail)
        toast(t('import.noTrades'), 'error')
        return fail
      }

      const mapped = mapConsolidatedTrades(consolidated, {
        broker: resolvedBroker,
        defaultMarket: settings.defaultMarket,
      })
      const storeTrades = toStoreTrades(mapped)
      const { trades: unique, skipped } = dedupeTrades(storeTrades, existingTrades)

      if (!unique.length) {
        const result: ImportCSVResult = {
          ok: false,
          broker: resolvedBroker,
          imported: 0,
          skippedDuplicates: skipped,
          skippedRows,
          openPositions: mapped.filter((m) => m.status === 'OPEN').length,
          closedTrades: mapped.filter((m) => m.status === 'CLOSED').length,
          errors: [],
          warnings: [...warnings, t('import.allDuplicates')],
          mapped,
          fileName,
        }
        setLastResult(result)
        toast(
          skipped === 1
            ? t('set.alreadyThere1', { account: settings.accountName })
            : t('set.alreadyThereN', { n: skipped, account: settings.accountName }),
          'info',
        )
        return result
      }

      const applied = importData({ version: 1, trades: unique, notes: [], settings }, 'merge')
      if (!applied.ok) {
        const fail = emptyFail(resolvedBroker, [applied.error], fileName)
        setLastResult(fail)
        toast(applied.error, 'error')
        return fail
      }

      // Persistencia cloud: executions + trades consolidados vinculados a user_id
      if (isSupabaseConfigured()) {
        try {
          const { data: sessionData } = await supabase.auth.getSession()
          const userId = sessionData.session?.user?.id
          if (userId) {
            // Solo sincronizar consolidated cuyo id está entre los unique mapeados
            const uniqueSourceIds = new Set(
              unique.flatMap((tr) => {
                const m = /^source:(.+)$/m.exec(tr.notes)
                return m ? [m[1]] : [tr.id.replace(/-(closed|open)$/, '')]
              }),
            )
            const toSync = consolidated.filter((ct) => uniqueSourceIds.has(ct.id))
            // Mapear executions asociadas a esos trades
            const syncKeys = new Set(toSync.flatMap((ct) => ct.executionKeys))
            const execToSync = executions.filter((ex, idx) => {
              const key =
                ex.externalId?.trim() ||
                `${ex.ticker}|${ex.executedAt}|${ex.side}|${ex.quantity}|${ex.price}|${idx}`
              return syncKeys.has(key)
            })

            await syncImportToSupabase({
              userId,
              accountName: settings.accountName,
              currency: settings.currency,
              broker: resolvedBroker,
              fileName,
              executions: execToSync.length ? execToSync : executions,
              consolidated: toSync.length ? toSync : consolidated,
            })
          }
        } catch (cloudErr) {
          const msg = cloudErr instanceof Error ? cloudErr.message : 'Error al sincronizar con la nube'
          toast(msg, 'error')
          // El import local ya se aplicó; no fallamos el resultado
        }
      }

      const closedTrades = unique.filter((x) => x.status === 'CLOSED').length
      const openPositions = unique.filter((x) => x.status === 'OPEN').length
      const result: ImportCSVResult = {
        ok: true,
        broker: resolvedBroker,
        imported: unique.length,
        skippedDuplicates: skipped,
        skippedRows,
        openPositions,
        closedTrades,
        errors,
        warnings,
        mapped,
        fileName,
      }
      setLastResult(result)

      const bits = [
        t('import.success', { n: unique.length, broker: resolvedBroker }),
        skipped ? t('set.alreadyN', { n: skipped }) : '',
        skippedRows ? t('set.rowsSkipped', { n: skippedRows }) : '',
        errors.length ? t('import.parseWarnings', { n: errors.length }) : '',
        fileName && isSpreadsheetFileName(fileName) ? t('import.fromExcel') : '',
      ].filter(Boolean)

      toast(bits.join(' · '), errors.length || skipped || skippedRows ? 'info' : 'success')

      if (navigateToDashboard) setPage('dashboard')
      return result
    },
    [
      existingTrades,
      importData,
      navigateToDashboard,
      setPage,
      settings,
      t,
      toast,
    ],
  )

  const importCsvText = useCallback(
    (content: string, broker: ImportBroker = defaultBroker, fileName?: string) => {
      setBusy(true)
      return runImport(content, broker, fileName).finally(() => setBusy(false))
    },
    [defaultBroker, runImport],
  )

  const importFileBlob = useCallback(
    async (file: File, broker: ImportBroker = defaultBroker) => {
      setBusy(true)
      try {
        const parts = await fileToCsvTexts(file)
        if (!parts.length || parts.every((p) => !p.trim())) {
          const fail = emptyFail(String(broker), [t('import.emptyFile')], file.name)
          setLastResult(fail)
          toast(t('import.emptyFile'), 'error')
          return fail
        }
        return await runImport(parts, broker, file.name)
      } catch (err) {
        const msg = spreadsheetErrorMessage(err, t)
        const fail = emptyFail(String(broker), [msg], file.name)
        setLastResult(fail)
        toast(msg, 'error')
        return fail
      } finally {
        setBusy(false)
      }
    },
    [defaultBroker, runImport, t, toast],
  )

  const pickAndImport = useCallback(
    async (broker: ImportBroker = defaultBroker) => {
      pendingBrokerRef.current = broker
      // Picker temporal: lee File binario (.xlsx). No usamos importFile utf-8 de Electron.
      const file = await pickBrokerFile()
      if (!file) return null
      return importFileBlob(file, broker)
    },
    [defaultBroker, importFileBlob],
  )

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>, broker?: ImportBroker) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      void importFileBlob(file, broker ?? pendingBrokerRef.current)
    },
    [importFileBlob],
  )

  return {
    busy,
    lastResult,
    fileInputRef,
    pickAndImport,
    importFileBlob,
    importCsvText,
    onFileInputChange,
  }
}
