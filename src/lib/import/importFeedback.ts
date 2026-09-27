/** Mensajes accionables para import broker (sin dependencia de React). */

export type ImportFeedbackLocale = 'es' | 'en'

const COPY = {
  es: {
    zeroParsed: (broker: string, rows: number) =>
      `0 operaciones reconocidas (${rows} fila(s) de datos). Bróker detectado: ${broker}.`,
    zeroParsedHint:
      'Comprueba el export (XTB: Closed/Open Positions; IB: Activity; DEGIRO: Transacciones). Prueba Auto o fuerza el bróker correcto.',
    zeroParsedOpenNoType:
      'En Open Positions de XTB hace falta columna Type/Tipo en cada fila (las filas resumen sin Type se omiten).',
    headers: (list: string) => `Columnas detectadas: ${list}`,
    allDuplicates: (n: number) =>
      n === 1
        ? '1 operación ya estaba en la cuenta (duplicada).'
        : `${n} operaciones ya estaban en la cuenta (duplicadas).`,
    duplicatesHint: 'No es un error de formato: el archivo ya se importó antes o coincide con trades existentes.',
    fileTooLarge: 'El archivo es demasiado grande (máx. 25 MB).',
  },
  en: {
    zeroParsed: (broker: string, rows: number) =>
      `0 trades recognized (${rows} data row(s)). Detected broker: ${broker}.`,
    zeroParsedHint:
      'Check the export (XTB: Closed/Open Positions; IB: Activity; DEGIRO: Transactions). Try Auto or pick the correct broker.',
    zeroParsedOpenNoType:
      'XTB Open Positions need a Type/Side column on each row (summary rows without Type are skipped).',
    headers: (list: string) => `Detected columns: ${list}`,
    allDuplicates: (n: number) =>
      n === 1 ? '1 trade was already in the account (duplicate).' : `${n} trades were already in the account (duplicates).`,
    duplicatesHint: 'Not a format error: the file was already imported or matches existing trades.',
    fileTooLarge: 'File is too large (max 25 MB).',
  },
} as const

export function formatDetectedHeaders(headers: string[], max = 8): string {
  const trimmed = headers.map((h) => h.trim()).filter(Boolean)
  if (!trimmed.length) return '—'
  const slice = trimmed.slice(0, max)
  const suffix = trimmed.length > max ? `… (+${trimmed.length - max})` : ''
  return slice.join(', ') + suffix
}

export function looksLikeXtbOpenWithoutType(warnings: string[], broker: string): boolean {
  if (broker !== 'XTB') return false
  return warnings.some((w) => /Type no parseables|sin Type|omitidas por datos incompletos/i.test(w))
}

export function buildZeroTradesFeedback(opts: {
  locale?: ImportFeedbackLocale
  broker: string
  dataRowCount: number
  warnings: string[]
  headers: string[]
}): { title: string; lines: string[] } {
  const locale = opts.locale ?? 'es'
  const c = COPY[locale]
  const lines: string[] = [c.zeroParsedHint]
  if (looksLikeXtbOpenWithoutType(opts.warnings, opts.broker)) {
    lines.unshift(c.zeroParsedOpenNoType)
  }
  if (opts.headers.length) {
    lines.push(c.headers(formatDetectedHeaders(opts.headers)))
  }
  for (const w of opts.warnings.slice(0, 3)) {
    lines.push(w)
  }
  return {
    title: c.zeroParsed(opts.broker, opts.dataRowCount),
    lines,
  }
}

export function buildDuplicatesFeedback(
  skipped: number,
  locale: ImportFeedbackLocale = 'es',
): { title: string; lines: string[] } {
  const c = COPY[locale]
  return {
    title: c.allDuplicates(skipped),
    lines: [c.duplicatesHint],
  }
}

export function fileTooLargeMessage(locale: ImportFeedbackLocale = 'es'): string {
  return COPY[locale].fileTooLarge
}
