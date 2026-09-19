import * as XLSX from 'xlsx'

const SPREADSHEET_EXT = /\.(xlsx|xls|xlsm)$/i

export function isSpreadsheetFileName(name: string | undefined | null): boolean {
  if (!name) return false
  return SPREADSHEET_EXT.test(name.trim())
}

function sheetRank(name: string): number {
  const n = name.toLowerCase()
  // Informe real XTB: "Closed Positions" / "Open Positions" / "Cash Operations"
  if (/^closed positions?$|closed\s*position|closed position history|posiciones?\s*cerrad|historial.*cerrad|zamkni/.test(n))
    return 100
  if (/^open positions?$|open\s*position|posiciones?\s*abiert/.test(n)) return 80
  if (/cash|operac(i[oó]n|iones)|operation|przepl/.test(n)) return -10
  return 10
}

function isCashSheet(name: string): boolean {
  return sheetRank(name) < 0
}

function isTradeSheet(name: string): boolean {
  const r = sheetRank(name)
  return r >= 80 // Closed + Open
}

/** Hojas de trades en orden: cerradas primero, luego abiertas. */
export function pickTradeSheetNames(sheetNames: string[]): string[] {
  return sheetNames
    .filter((n) => isTradeSheet(n) || (!isCashSheet(n) && sheetRank(n) > 0 && sheetNames.length === 1))
    .sort((a, b) => sheetRank(b) - sheetRank(a) || a.localeCompare(b))
}

/** @deprecated Prefer pickTradeSheetNames — mantiene compat (1ª hoja de trades). */
export function pickTradeSheetName(sheetNames: string[]): string | undefined {
  return pickTradeSheetNames(sheetNames)[0] ?? sheetNames[0]
}

function sheetToCsv(sheet: XLSX.WorkSheet): string {
  return XLSX.utils.sheet_to_csv(sheet, {
    blankrows: false,
    dateNF: 'yyyy-mm-dd hh:mm:ss',
  })
}

/**
 * Convierte todas las hojas de posiciones (Closed + Open) a CSV independientes.
 * Cash Operations se ignora.
 */
export function workbookArrayBufferToCsvParts(buffer: ArrayBuffer): string[] {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('EMPTY_SPREADSHEET')
  }

  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    cellNF: false,
    cellText: false,
  })

  let names = pickTradeSheetNames(workbook.SheetNames)
  // Fallback: si el ranking no matchea (export raro), usar todas salvo cash
  if (!names.length) {
    names = workbook.SheetNames.filter((n) => !isCashSheet(n))
  }
  if (!names.length) throw new Error('EMPTY_SPREADSHEET')

  const parts: string[] = []
  for (const name of names) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const csv = sheetToCsv(sheet).trim()
    if (csv) parts.push(csv)
  }
  if (!parts.length) throw new Error('EMPTY_SPREADSHEET')
  return parts
}

/** Compat: concatena hojas (el engine debe preferir csv parts). */
export function workbookArrayBufferToCsv(buffer: ArrayBuffer): string {
  return workbookArrayBufferToCsvParts(buffer).join('\n\n')
}

/** Lee un File: CSV → [texto]; XLSX → un CSV por hoja de trades. */
export async function fileToCsvTexts(file: File): Promise<string[]> {
  if (isSpreadsheetFileName(file.name)) {
    const buffer = await file.arrayBuffer()
    return workbookArrayBufferToCsvParts(buffer)
  }
  const text = await file.text()
  return text.trim() ? [text] : []
}

/** @deprecated Usar fileToCsvTexts. */
export async function fileToCsvText(file: File): Promise<string> {
  const parts = await fileToCsvTexts(file)
  if (!parts.length) throw new Error('EMPTY_SPREADSHEET')
  return parts.join('\n\n')
}

export const BROKER_FILE_ACCEPT =
  '.csv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
