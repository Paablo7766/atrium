/** Parser CSV con comillas, BOM y delimitador único (, | ; | tab). */

export type CsvDelimiter = ',' | ';' | '\t'

/** Detecta delimitador por la primera línea no vacía (prioriza ; en exports EU). */
export function detectDelimiter(text: string): CsvDelimiter {
  const first = text.replace(/^\ufeff/, '').split(/\r?\n/).find((l) => l.trim()) ?? ''
  // Contar fuera de comillas
  let commas = 0
  let semis = 0
  let tabs = 0
  let inQ = false
  for (let i = 0; i < first.length; i++) {
    const c = first[i]
    if (c === '"') {
      if (inQ && first[i + 1] === '"') i++
      else inQ = !inQ
      continue
    }
    if (inQ) continue
    if (c === ',') commas++
    else if (c === ';') semis++
    else if (c === '\t') tabs++
  }
  if (tabs > 0 && tabs >= commas && tabs >= semis) return '\t'
  if (semis > commas) return ';'
  return ','
}

export function parseCsvText(text: string, delimiter?: CsvDelimiter): string[][] {
  const delim = delimiter ?? detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQ = false
  const src = text.replace(/^\ufeff/, '')

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += c
    } else if (c === '"') {
      inQ = true
    } else if (c === delim) {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cur)
      cur = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else {
      cur += c
    }
  }
  row.push(cur)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

export function rowsToObjects(matrix: string[][], headerRowIndex = 0): Record<string, string>[] {
  if (matrix.length < headerRowIndex + 2) return []
  const headers = matrix[headerRowIndex].map((h) => h.trim())
  return matrix.slice(headerRowIndex + 1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      if (!h) return
      obj[h] = cells[i] ?? ''
    })
    return obj
  })
}

/**
 * XTB y otros brokers ponen título/metadatos encima de la tabla.
 * Busca la fila que parece cabecera real (Symbol + Type/Volume + Open…).
 */
export function findHeaderRowIndex(matrix: string[][]): number {
  const score = (cells: string[]) => {
    const n = new Set(
      cells.map((c) =>
        c
          .replace(/^\ufeff/, '')
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, ''),
      ),
    )
    let s = 0
    if (
      n.has('symbol') ||
      n.has('simbolo') ||
      n.has('instrument') ||
      n.has('instrumento') ||
      n.has('instrumentposition') ||
      n.has('ticker')
    )
      s += 3
    if (n.has('type') || n.has('tipo') || n.has('side')) s += 2
    if (n.has('volume') || n.has('volumen') || n.has('quantity') || n.has('lots') || n.has('cantidad')) s += 2
    if (
      n.has('opentime') ||
      n.has('openprice') ||
      n.has('closetime') ||
      n.has('closeprice') ||
      n.has('opentimeutc') ||
      n.has('closetimeutc') ||
      n.has('horadeapertura') ||
      n.has('preciodeapertura') ||
      n.has('horadecierre') ||
      n.has('preciodecierre')
    )
      s += 2
    if (n.has('position') || n.has('posicion') || n.has('positionid')) s += 1
    return s
  }

  let bestIdx = 0
  let bestScore = -1
  const limit = Math.min(matrix.length, 50)
  for (let i = 0; i < limit; i++) {
    const s = score(matrix[i] ?? [])
    if (s > bestScore) {
      bestScore = s
      bestIdx = i
    }
    if (s >= 7) return i
  }
  return bestScore >= 5 ? bestIdx : 0
}
