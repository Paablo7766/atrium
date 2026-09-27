import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CSVImportEngine } from './engine'
import { fileToCsvTexts } from './spreadsheet'

const here = dirname(fileURLToPath(import.meta.url))
const userXlsx = join(here, '__fixtures__', 'user', 'xtb-operaciones-2025.xlsx')
const committedCsv = join(here, '__fixtures__', 'xtb-operaciones-2025.sample.csv')

describe('XTB sample from user xlsx (OPERACIONES-XTB-2025)', () => {
  it('committed CSV regression (anonimized export)', () => {
    expect(existsSync(committedCsv)).toBe(true)
    const csv = readFileSync(committedCsv, 'utf8')
    const { broker, trades, dataRowCount, errors } = new CSVImportEngine().importAndGroup(csv, 'AUTO')
    expect(errors).toHaveLength(0)
    expect(broker).toBe('XTB')
    expect(dataRowCount).toBe(3)
    expect(trades.length).toBe(2)
    expect(trades.every((t) => t.status === 'CLOSED')).toBe(true)
  })

  it.skipIf(!existsSync(userXlsx))('user xlsx matches CSV regression counts', async () => {
    const buf = readFileSync(userXlsx)
    const parts = await fileToCsvTexts(new File([buf], 'xtb-operaciones-2025.xlsx'))
    const fromXlsx = new CSVImportEngine().importAndGroup(parts, 'AUTO')
    const csv = existsSync(committedCsv) ? readFileSync(committedCsv, 'utf8') : parts[0]
    const fromCsv = new CSVImportEngine().importAndGroup(csv, 'AUTO')
    expect(fromXlsx.trades.length).toBe(fromCsv.trades.length)
  })
})
