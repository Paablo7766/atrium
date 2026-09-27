import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CSVImportEngine } from './engine'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')

describe('DEGIRO adapter', () => {
  it('importa transacciones EU y cierra posición', () => {
    const csv = readFileSync(join(fixtureDir, 'degiro-transactions.csv'), 'utf8')
    const { broker, trades, errors } = new CSVImportEngine().importAndGroup(csv, 'AUTO')
    expect(errors).toHaveLength(0)
    expect(broker).toBe('DEGIRO')
    expect(trades.length).toBe(1)
    expect(trades[0].status).toBe('CLOSED')
    expect(trades[0].quantityClosed).toBe(2)
  })
})
